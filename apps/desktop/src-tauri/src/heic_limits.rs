use super::AuthError;

pub(super) fn check(bytes: &[u8], max_pixels: u64) -> Result<(), AuthError> {
    let ctx = heic_rs::context::Context::open(bytes).map_err(|_| AuthError::InvalidInput)?;
    let ids = match ctx
        .grid(ctx.meta.primary)
        .map_err(|_| AuthError::InvalidInput)?
    {
        Some((_, ids)) => ids,
        None => vec![ctx.meta.primary],
    };
    if ids.len() > 256 {
        return Err(AuthError::InvalidInput);
    }
    let mut total = 0u64;
    for id in ids {
        let props = ctx.props(id).map_err(|_| AuthError::InvalidInput)?;
        let hvcc = props.hvcc.ok_or(AuthError::InvalidInput)?;
        let mut largest = 0;
        for nal in hvcc
            .parameter_sets()
            .into_iter()
            .filter(|nal| nal.first().is_some_and(|b| (b >> 1) & 63 == 33))
        {
            let (width, height) = raw_sps_dimensions(nal)?;
            if width == 0 || height == 0 || width > 8192 || height > 8192 {
                return Err(AuthError::InvalidInput);
            }
            largest = largest.max(u64::from(width) * u64::from(height));
        }
        if largest == 0 {
            return Err(AuthError::InvalidInput);
        }
        total = total.checked_add(largest).ok_or(AuthError::InvalidInput)?;
        if total > max_pixels {
            return Err(AuthError::InvalidInput);
        }
    }
    Ok(())
}

// heic-rs 0.1.4 allocates from raw SPS geometry before applying its output limit.
// Read only the HEVC SPS prefix (7.3.2.2), before crop/rotation can conceal allocation size.
fn raw_sps_dimensions(nal: &[u8]) -> Result<(u32, u32), AuthError> {
    if nal.len() < 3 {
        return Err(AuthError::InvalidInput);
    }
    let mut rbsp = Vec::with_capacity(nal.len() - 2);
    let mut zeros = 0;
    for &byte in &nal[2..] {
        if zeros >= 2 && byte == 3 {
            zeros = 0;
            continue;
        }
        zeros = if byte == 0 { zeros + 1 } else { 0 };
        rbsp.push(byte);
    }
    let mut bits = Bits {
        bytes: &rbsp,
        position: 0,
    };
    bits.skip(4)?;
    let layers = bits.read(3)? as usize;
    if layers > 6 {
        return Err(AuthError::InvalidInput);
    }
    bits.skip(1 + 96)?;
    let mut sub_layers = Vec::with_capacity(layers);
    for _ in 0..layers {
        sub_layers.push((bits.read(1)? != 0, bits.read(1)? != 0));
    }
    if layers > 0 {
        bits.skip((8 - layers) * 2)?;
    }
    for (profile, level) in sub_layers {
        if profile {
            bits.skip(88)?;
        }
        if level {
            bits.skip(8)?;
        }
    }
    bits.ue()?;
    let chroma = bits.ue()?;
    if chroma > 3 {
        return Err(AuthError::InvalidInput);
    }
    if chroma == 3 {
        bits.skip(1)?;
    }
    Ok((bits.ue()?, bits.ue()?))
}

struct Bits<'a> {
    bytes: &'a [u8],
    position: usize,
}
impl Bits<'_> {
    fn skip(&mut self, count: usize) -> Result<(), AuthError> {
        let next = self
            .position
            .checked_add(count)
            .ok_or(AuthError::InvalidInput)?;
        if next > self.bytes.len() * 8 {
            return Err(AuthError::InvalidInput);
        }
        self.position = next;
        Ok(())
    }
    fn read(&mut self, count: usize) -> Result<u32, AuthError> {
        let start = self.position;
        self.skip(count)?;
        let mut value = 0;
        for bit in start..self.position {
            value = (value << 1) | u32::from((self.bytes[bit / 8] >> (7 - bit % 8)) & 1);
        }
        Ok(value)
    }
    fn ue(&mut self) -> Result<u32, AuthError> {
        let mut zeros = 0;
        while self.read(1)? == 0 {
            zeros += 1;
            if zeros > 30 {
                return Err(AuthError::InvalidInput);
            }
        }
        Ok(((1u32 << zeros) - 1) + self.read(zeros)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sps_prefix_handles_sublayers_and_uncropped_dimensions() {
        let ue = |value: u32| {
            let value = format!("{:b}", value + 1);
            format!("{}{}", "0".repeat(value.len() - 1), value)
        };
        for layers in [0, 1, 6] {
            let mut bits = format!("0000{layers:03b}1{}", "0".repeat(96));
            for _ in 0..layers {
                bits.push_str("11");
            }
            if layers > 0 {
                bits.push_str(&"0".repeat((8 - layers) * 2));
            }
            for _ in 0..layers {
                bits.push_str(&"0".repeat(88 + 8));
            }
            bits.push_str(&format!("{}{}{}{}", ue(0), ue(1), ue(9000), ue(16)));
            bits.push_str(&"0".repeat((8 - bits.len() % 8) % 8));
            let mut nal = vec![0x42, 1];
            let mut zeros = 0;
            for chunk in bits.as_bytes().chunks(8) {
                let value = chunk
                    .iter()
                    .fold(0u8, |acc, byte| (acc << 1) | (byte - b'0'));
                if zeros >= 2 && value <= 3 {
                    nal.push(3);
                    zeros = 0;
                }
                nal.push(value);
                zeros = if value == 0 { zeros + 1 } else { 0 };
            }
            assert_eq!(raw_sps_dimensions(&nal).unwrap(), (9000, 16));
            for length in 0..10 {
                assert!(raw_sps_dimensions(&nal[..length.min(nal.len())]).is_err());
            }
        }
        assert!(raw_sps_dimensions(&[0x42, 1]).is_err());
        let mut overlong = vec![0x42, 1];
        overlong.extend([0; 128]);
        assert!(raw_sps_dimensions(&overlong).is_err());
    }
    #[test]
    fn budget_uses_actual_sps_geometry_and_all_grid_tiles() {
        for fixture in [
            include_bytes!("../../../../tests/fixtures/heic/gradient-512.heic").as_slice(),
            include_bytes!("../../../../tests/fixtures/heic/checker-1024.heic").as_slice(),
        ] {
            let mut forged = fixture.to_vec();
            let positions: Vec<_> = forged
                .windows(4)
                .enumerate()
                .filter_map(|(i, v)| (v == b"ispe").then_some(i))
                .collect();
            for i in positions {
                forged[i + 8..i + 12].copy_from_slice(&1u32.to_be_bytes());
                forged[i + 12..i + 16].copy_from_slice(&1u32.to_be_bytes());
            }
            assert!(
                check(&forged, 1).is_err(),
                "container dimensions must not bypass coded allocation limit"
            );
            assert!(check(fixture, 32 * 1024 * 1024).is_ok());
        }
        let grid = include_bytes!("../../../../tests/fixtures/heic/checker-1024.heic");
        assert!(
            check(grid, 512 * 512).is_err(),
            "all four coded tiles count against the budget"
        );
    }
}
