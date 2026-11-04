//! Private Windows launch transport/UI. No public CLI, TLS bypass or test endpoint.
use super::update_launch::{CANONICAL_UPDATE_URL, StableAsset, UpdateChoice};
use super::update_runner::RunnerError;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::windows::fs::{MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
    ptr::{null, null_mut},
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::*,
    Globalization::GetUserDefaultUILanguage,
    Networking::WinHttp::*,
    System::LibraryLoader::GetModuleHandleW,
    UI::{Input::KeyboardAndMouse::SetFocus, WindowsAndMessaging::*},
};

const DWLP_USER: usize = 2 * std::mem::size_of::<isize>();
const MAX_METADATA: u64 = 1024 * 1024;
const MAX_INSTALLER: u64 = 1024 * 1024 * 1024;
fn error() -> RunnerError {
    RunnerError::Io("Secure update operation failed".into())
}
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
struct Http(*mut std::ffi::c_void);
impl Http {
    fn new(p: *mut std::ffi::c_void) -> Result<Self, RunnerError> {
        if p.is_null() {
            Err(error())
        } else {
            Ok(Self(p))
        }
    }
    fn ptr(&self) -> *mut std::ffi::c_void {
        self.0
    }
}
impl Drop for Http {
    fn drop(&mut self) {
        unsafe {
            WinHttpCloseHandle(self.0);
        }
    }
}
fn url_checked(value: &str, initial: bool) -> Result<tauri::Url, RunnerError> {
    let url = tauri::Url::parse(value).map_err(|_| error())?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port_or_known_default() != Some(443)
        || url.fragment().is_some()
    {
        return Err(error());
    }
    let host = url.host_str().ok_or_else(error)?;
    if host == "github.com" {
        if !url
            .path()
            .starts_with("/etianwang/Honsen-procure/releases/download/")
        {
            return Err(error());
        }
    } else if initial
        || ![
            "release-assets.githubusercontent.com",
            "objects.githubusercontent.com",
            "github-releases.githubusercontent.com",
        ]
        .contains(&host)
    {
        return Err(error());
    }
    Ok(url)
}
fn header(request: &Http, kind: u32) -> Result<String, RunnerError> {
    let mut buffer = [0u16; 8192];
    let mut size = (buffer.len() * 2) as u32;
    if unsafe {
        WinHttpQueryHeaders(
            request.ptr(),
            kind,
            null(),
            buffer.as_mut_ptr().cast(),
            &mut size,
            null_mut(),
        )
    } == 0
    {
        return Err(error());
    }
    let count = size as usize / 2;
    String::from_utf16(&buffer[..count.min(buffer.len())])
        .map(|s| s.trim_end_matches('\0').to_owned())
        .map_err(|_| error())
}
fn remaining(deadline: Instant) -> Result<i32, RunnerError> {
    let ms = deadline
        .saturating_duration_since(Instant::now())
        .as_millis();
    if ms == 0 {
        Err(error())
    } else {
        Ok(ms.min(3000) as i32)
    }
}
use std::sync::{Arc, Mutex, mpsc};
enum HttpEvent {
    Sent,
    Headers,
    Data(Vec<u8>),
    Failed,
}
struct AsyncState {
    sender: mpsc::Sender<HttpEvent>,
    buffer: Mutex<Box<[u8; 65536]>>,
}
unsafe extern "system" fn http_callback(
    _: *mut std::ffi::c_void,
    context: usize,
    status: u32,
    information: *mut std::ffi::c_void,
    length: u32,
) {
    if context == 0 {
        return;
    }
    if status == WINHTTP_CALLBACK_STATUS_HANDLE_CLOSING {
        unsafe {
            drop(Arc::from_raw(context as *const AsyncState));
        }
        return;
    }
    // WinHTTP owns one Arc until its final HANDLE_CLOSING callback. Buffer
    // allocation therefore outlives every pending asynchronous read/cancellation.
    let state = unsafe { &*(context as *const AsyncState) };
    let event = match status {
        WINHTTP_CALLBACK_STATUS_SENDREQUEST_COMPLETE => HttpEvent::Sent,
        WINHTTP_CALLBACK_STATUS_HEADERS_AVAILABLE => HttpEvent::Headers,
        WINHTTP_CALLBACK_STATUS_READ_COMPLETE => {
            if length > 65536 || (length != 0 && information.is_null()) {
                HttpEvent::Failed
            } else {
                HttpEvent::Data(if length == 0 {
                    Vec::new()
                } else {
                    unsafe { std::slice::from_raw_parts(information.cast::<u8>(), length as usize) }
                        .to_vec()
                })
            }
        }
        WINHTTP_CALLBACK_STATUS_REQUEST_ERROR => HttpEvent::Failed,
        _ => return,
    };
    let _ = state.sender.send(event);
}
fn wait_event(
    receiver: &mpsc::Receiver<HttpEvent>,
    deadline: Instant,
) -> Result<HttpEvent, RunnerError> {
    receiver
        .recv_timeout(deadline.saturating_duration_since(Instant::now()))
        .map_err(|_| error())
}
fn transfer(
    url: &tauri::Url,
    deadline: Instant,
    cap: u64,
    mut write: impl FnMut(&[u8]) -> Result<(), RunnerError>,
) -> Result<Option<String>, RunnerError> {
    remaining(deadline)?;
    let agent = wide("HonsenProcureUpdateRunner/1");
    let session = Http::new(unsafe {
        WinHttpOpen(
            agent.as_ptr(),
            WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
            null(),
            null(),
            WINHTTP_FLAG_ASYNC,
        )
    })?;
    let timeout = remaining(deadline)?;
    if unsafe { WinHttpSetTimeouts(session.ptr(), timeout, timeout, timeout, timeout) } == 0 {
        return Err(error());
    }
    let host = wide(url.host_str().ok_or_else(error)?);
    let connection = Http::new(unsafe { WinHttpConnect(session.ptr(), host.as_ptr(), 443, 0) })?;
    let target = wide(&format!(
        "{}{}",
        url.path(),
        url.query().map(|q| format!("?{q}")).unwrap_or_default()
    ));
    let get = wide("GET");
    let request = Http::new(unsafe {
        WinHttpOpenRequest(
            connection.ptr(),
            get.as_ptr(),
            target.as_ptr(),
            null(),
            null(),
            null(),
            WINHTTP_FLAG_SECURE,
        )
    })?;
    let flags = WINHTTP_CALLBACK_STATUS_SENDREQUEST_COMPLETE
        | WINHTTP_CALLBACK_STATUS_HEADERS_AVAILABLE
        | WINHTTP_CALLBACK_STATUS_READ_COMPLETE
        | WINHTTP_CALLBACK_STATUS_REQUEST_ERROR
        | WINHTTP_CALLBACK_STATUS_HANDLE_CREATED
        | WINHTTP_CALLBACK_STATUS_HANDLE_CLOSING;
    let prior = unsafe { WinHttpSetStatusCallback(request.ptr(), Some(http_callback), flags, 0) };
    if prior.is_some_and(|callback| callback as usize == usize::MAX) {
        return Err(error());
    }
    let (sender, receiver) = mpsc::channel();
    let state = Arc::new(AsyncState {
        sender,
        buffer: Mutex::new(Box::new([0; 65536])),
    });
    let context = Arc::into_raw(state.clone()) as usize;
    if unsafe {
        WinHttpSetOption(
            request.ptr(),
            WINHTTP_OPTION_CONTEXT_VALUE,
            (&context as *const usize).cast(),
            std::mem::size_of::<usize>() as u32,
        )
    } == 0
    {
        unsafe {
            drop(Arc::from_raw(context as *const AsyncState));
        }
        return Err(error());
    }
    // All request operations below are async. On every error/deadline, request
    // Drop cancels with WinHttpCloseHandle; raw context is reclaimed only by
    // HANDLE_CLOSING, never by this stack frame.
    let disabled =
        WINHTTP_DISABLE_REDIRECTS | WINHTTP_DISABLE_AUTHENTICATION | WINHTTP_DISABLE_COOKIES;
    if unsafe {
        WinHttpSetOption(
            request.ptr(),
            WINHTTP_OPTION_DISABLE_FEATURE,
            (&disabled as *const u32).cast(),
            4,
        )
    } == 0
    {
        return Err(error());
    }
    let never = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
    if unsafe {
        WinHttpSetOption(
            request.ptr(),
            WINHTTP_OPTION_REDIRECT_POLICY,
            (&never as *const u32).cast(),
            4,
        )
    } == 0
    {
        return Err(error());
    }
    let headers = wide("Accept: application/vnd.github+json\r\nAccept-Encoding: identity\r\n");
    remaining(deadline)?;
    if unsafe {
        WinHttpSendRequest(
            request.ptr(),
            headers.as_ptr(),
            u32::MAX,
            null(),
            0,
            0,
            context,
        )
    } == 0
    {
        return Err(error());
    }
    if !matches!(wait_event(&receiver, deadline)?, HttpEvent::Sent) {
        return Err(error());
    }
    if unsafe { WinHttpReceiveResponse(request.ptr(), null_mut()) } == 0 {
        return Err(error());
    }
    if !matches!(wait_event(&receiver, deadline)?, HttpEvent::Headers) {
        return Err(error());
    }
    let status = header(&request, WINHTTP_QUERY_STATUS_CODE)?
        .parse::<u16>()
        .map_err(|_| error())?;
    if matches!(status, 301 | 302 | 303 | 307 | 308) {
        return Ok(Some(header(&request, WINHTTP_QUERY_LOCATION)?));
    }
    if status != 200 {
        return Err(error());
    }
    if let Ok(length) = header(&request, WINHTTP_QUERY_CONTENT_LENGTH) {
        if length.parse::<u64>().map_err(|_| error())? > cap {
            return Err(error());
        }
    }
    let mut total = 0u64;
    loop {
        remaining(deadline)?;
        let pointer = state.buffer.lock().map_err(|_| error())?.as_mut_ptr();
        if unsafe { WinHttpReadData(request.ptr(), pointer.cast(), 65536, null_mut()) } == 0 {
            return Err(error());
        }
        let HttpEvent::Data(bytes) = wait_event(&receiver, deadline)? else {
            return Err(error());
        };
        if bytes.is_empty() {
            break;
        }
        total = total.checked_add(bytes.len() as u64).ok_or_else(error)?;
        if total > cap {
            return Err(error());
        }
        write(&bytes)?;
    }
    remaining(deadline)?;
    Ok(None)
}
pub fn fetch_release_metadata() -> Result<Vec<u8>, RunnerError> {
    let url = tauri::Url::parse(CANONICAL_UPDATE_URL).map_err(|_| error())?;
    let mut bytes = Vec::new();
    let redirect = transfer(
        &url,
        Instant::now() + Duration::from_secs(15),
        MAX_METADATA,
        |chunk| {
            bytes.extend_from_slice(chunk);
            Ok(())
        },
    )?;
    if redirect.is_some() {
        Err(error())
    } else {
        Ok(bytes)
    }
}

pub struct DownloadedInstaller {
    directory: PathBuf,
    path: PathBuf,
    verified_file: Option<File>,
    directory_guards: Vec<File>,
}
impl DownloadedInstaller {
    pub fn path(&self) -> &Path {
        &self.path
    }
    fn create() -> Result<Self, RunnerError> {
        let base = std::env::temp_dir();
        if !base.is_absolute() {
            return Err(error());
        }
        let mut ancestors: Vec<_> = base.ancestors().collect();
        ancestors.reverse();
        let mut guards = Vec::new();
        for path in ancestors {
            guards.push(guard_directory(path)?);
        }
        let directory = base.join(format!("honsen-procure-launch-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory)?;
        Self::finish_created_directory(directory, guards)
    }
    fn finish_created_directory(
        directory: PathBuf,
        mut guards: Vec<File>,
    ) -> Result<Self, RunnerError> {
        // Until this handle pins the leaf, never construct a file-deleting
        // owner: a rejected junction could redirect installer.exe outside.
        let leaf = match guard_directory(&directory) {
            Ok(leaf) => leaf,
            Err(error) => {
                let _ = fs::remove_dir(&directory); // entry only; never recurse
                return Err(error);
            }
        };
        guards.push(leaf);
        let owner = Self {
            path: directory.join("installer.exe"),
            directory,
            verified_file: None,
            directory_guards: guards,
        };
        Ok(owner)
    }
    fn verify_and_hold(&mut self, size: u64, expected: &str) -> Result<(), RunnerError> {
        use windows_sys::Win32::Storage::FileSystem::{
            FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ,
        };
        let mut file = OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(&self.path)?;
        let metadata = file.metadata()?;
        if metadata.file_attributes() & 0x400 != 0 || !metadata.is_file() || metadata.len() != size
        {
            return Err(RunnerError::HashMismatch);
        }
        let mut digest = Sha256::new();
        let mut bytes = [0u8; 65536];
        let mut length = 0u64;
        loop {
            let read = file.read(&mut bytes)?;
            if read == 0 {
                break;
            }
            length = length.checked_add(read as u64).ok_or_else(error)?;
            if length > size {
                return Err(RunnerError::HashMismatch);
            }
            digest.update(&bytes[..read]);
        }
        if length != size || format!("{:x}", digest.finalize()) != expected.to_ascii_lowercase() {
            return Err(RunnerError::HashMismatch);
        }
        self.verified_file = Some(file);
        Ok(())
    }
}
fn guard_directory(path: &Path) -> Result<File, RunnerError> {
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ, FILE_SHARE_WRITE,
    };
    let file = OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_dir() || metadata.file_attributes() & 0x400 != 0 {
        return Err(error());
    }
    Ok(file)
}
impl Drop for DownloadedInstaller {
    fn drop(&mut self) {
        drop(self.verified_file.take());
        let _ = fs::remove_file(&self.path);
        // Release only the leaf so it can be removed; keep all ancestors
        // pinned until that path-based removal has completed.
        drop(self.directory_guards.pop());
        let _ = fs::remove_dir(&self.directory);
        self.directory_guards.clear();
    }
}
pub fn download_installer(asset: &StableAsset) -> Result<DownloadedInstaller, RunnerError> {
    super::update_launch::compare_versions(&asset.version, &asset.version)?;
    let expected_name = format!("Honsen-Procure-{}-Setup.exe", asset.version);
    let expected_url = format!(
        "https://github.com/etianwang/Honsen-procure/releases/download/v{}/{}",
        asset.version, expected_name
    );
    if asset.size == 0
        || asset.size > MAX_INSTALLER
        || asset.sha256.len() != 64
        || !asset.sha256.bytes().all(|b| b.is_ascii_hexdigit())
        || asset.name != expected_name
        || asset.url != expected_url
    {
        return Err(error());
    }
    let mut url = url_checked(&asset.url, true)?;
    if url.query().is_some()
        || url.path_segments().and_then(|mut parts| parts.next_back()) != Some(asset.name.as_str())
    {
        return Err(error());
    }
    let mut result = DownloadedInstaller::create()?;
    let mut file = OpenOptions::new()
        .write(true)
        .share_mode(windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ)
        .create_new(true)
        .open(result.path())?;
    let deadline = Instant::now() + Duration::from_secs(120);
    let mut digest = Sha256::new();
    let mut length = 0u64;
    for hop in 0..=5 {
        let redirect = transfer(&url, deadline, asset.size, |chunk| {
            length += chunk.len() as u64;
            digest.update(chunk);
            file.write_all(chunk)?;
            Ok(())
        })?;
        if let Some(location) = redirect {
            if hop == 5 {
                return Err(error());
            }
            url = url_checked(&location, false)?;
            continue;
        }
        file.sync_all()?;
        drop(file);
        if length != asset.size
            || format!("{:x}", digest.finalize()) != asset.sha256.to_ascii_lowercase()
        {
            return Err(RunnerError::HashMismatch);
        }
        // Re-open after closing the writer, then hash the locked on-disk handle
        // itself. Keep this READ-only/share-READ guard through the apply child.
        result.verify_and_hold(asset.size, &asset.sha256)?;
        return Ok(result);
    }
    Err(error())
}

#[derive(Clone, Copy)]
enum Locale {
    Zh,
    En,
    Fr,
}
fn locale() -> Locale {
    match unsafe { GetUserDefaultUILanguage() } & 0x3ff {
        0x04 => Locale::Zh,
        0x0c => Locale::Fr,
        0x09 => Locale::En,
        _ => Locale::Zh,
    }
}
fn localized<'a>(locale: Locale, zh: &'a str, en: &'a str, fr: &'a str) -> &'a str {
    match locale {
        Locale::Zh => zh,
        Locale::En => en,
        Locale::Fr => fr,
    }
}
struct Template(Vec<u16>);
impl Template {
    fn word(&mut self, n: u16) {
        self.0.push(n)
    }
    fn dword(&mut self, n: u32) {
        self.word(n as u16);
        self.word((n >> 16) as u16)
    }
    fn text(&mut self, s: &str) {
        self.0.extend(wide(s))
    }
    fn align(&mut self) {
        if self.0.len() % 2 != 0 {
            self.word(0)
        }
    }
    fn item(
        &mut self,
        id: u16,
        x: u16,
        y: u16,
        w: u16,
        h: u16,
        class: u16,
        text: &str,
        default: bool,
    ) {
        self.align();
        self.dword(
            WS_CHILD
                | WS_VISIBLE
                | if class == 0x80 {
                    WS_TABSTOP
                        | if default {
                            BS_DEFPUSHBUTTON as u32
                        } else {
                            BS_PUSHBUTTON as u32
                        }
                } else {
                    0
                },
        );
        self.dword(0);
        for n in [x, y, w, h, id] {
            self.word(n)
        }
        self.word(0xffff);
        self.word(class);
        self.text(text);
        self.word(0)
    }
}
unsafe extern "system" fn dialog_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> isize {
    match message {
        WM_INITDIALOG => {
            unsafe {
                SetWindowLongPtrW(hwnd, DWLP_USER as i32, lparam);
                SetFocus(GetDlgItem(hwnd, lparam as i32));
            }
            0
        }
        WM_COMMAND => {
            let id = (wparam & 0xffff) as i32;
            if id == IDCANCEL {
                let default = unsafe { GetWindowLongPtrW(hwnd, DWLP_USER as i32) };
                unsafe { EndDialog(hwnd, default) };
                1
            } else if [100, 101, 102, 201, 202].contains(&id) {
                unsafe { EndDialog(hwnd, id as isize) };
                1
            } else {
                0
            }
        }
        WM_CLOSE => {
            let default = unsafe { GetWindowLongPtrW(hwnd, DWLP_USER as i32) };
            unsafe { EndDialog(hwnd, default) };
            1
        }
        _ => 0,
    }
}
fn dialog(text: &str, buttons: &[(u16, &str)], default: u16) -> Result<u16, RunnerError> {
    let mut template = Template(Vec::new());
    template.dword(WS_POPUP | WS_CAPTION | WS_SYSMENU | DS_MODALFRAME as u32 | DS_SETFONT as u32);
    template.dword(0);
    template.word((buttons.len() + 1) as u16);
    for n in [0, 0, 390, 140] {
        template.word(n)
    }
    template.word(0);
    template.word(0);
    template.text("Honsen Procure");
    template.word(9);
    template.text("Segoe UI");
    template.item(10, 12, 12, 366, 65, 0x82, text, false);
    for (index, (id, label)) in buttons.iter().enumerate() {
        let width = if buttons.len() == 3 { 116 } else { 174 };
        template.item(
            *id,
            12 + (index as u16) * (width + 8),
            91,
            width,
            31,
            0x80,
            label,
            *id == default,
        )
    }
    // DLGTEMPLATE and each DLGITEMTEMPLATE require DWORD alignment. Vec<u32>
    // owns the backing allocation throughout the synchronous modal call.
    template.align();
    let aligned: Vec<u32> = template
        .0
        .chunks_exact(2)
        .map(|p| u32::from(p[0]) | (u32::from(p[1]) << 16))
        .collect();
    let result = unsafe {
        DialogBoxIndirectParamW(
            GetModuleHandleW(null()),
            aligned.as_ptr().cast(),
            null_mut(),
            Some(dialog_proc),
            default as isize,
        )
    };
    if result == -1 || result == 0 {
        Err(error())
    } else {
        Ok(result as u16)
    }
}
fn choose(locale: Locale, installed: &str, new: &str) -> Result<UpdateChoice, RunnerError> {
    let message = format!(
        "{}\r\n{} → {}",
        localized(
            locale,
            "发现新的稳定版本。请选择更新方式。",
            "A newer stable version is available. Choose an action.",
            "Une nouvelle version stable est disponible. Choisissez une action."
        ),
        installed,
        new
    );
    match dialog(
        &message,
        &[
            (
                100,
                localized(locale, "立即更新", "Update now", "Mettre à jour"),
            ),
            (
                101,
                localized(locale, "稍后提醒", "Remind later", "Rappeler plus tard"),
            ),
            (
                102,
                localized(
                    locale,
                    "跳过此版本",
                    "Skip this version",
                    "Ignorer cette version",
                ),
            ),
        ],
        101,
    )? {
        100 => Ok(UpdateChoice::UpdateNow),
        102 => Ok(UpdateChoice::SkipVersion),
        101 => Ok(UpdateChoice::RemindLater),
        _ => Err(error()),
    }
}
pub fn choose_update(installed: &str, new: &str) -> Result<UpdateChoice, RunnerError> {
    choose(locale(), installed, new)
}
pub fn confirm_local_after_failure() -> Result<bool, RunnerError> {
    let l = locale();
    Ok(dialog(
        localized(
            l,
            "更新检查、下载或校验未完成，未确认本地版本为最新。只有确认后才会重新核验并启动本地版本。是否继续？",
            "Update check, download or verification did not complete. The local version is NOT confirmed latest. Only after confirmation will it be revalidated and launched. Continue?",
            "Vérification, téléchargement ou validation non terminé. La version locale n’est PAS confirmée comme la plus récente. Après confirmation seulement, elle sera revérifiée et démarrée. Continuer ?",
        ),
        &[
            (
                201,
                localized(
                    l,
                    "继续启动本地版本",
                    "Continue locally",
                    "Continuer localement",
                ),
            ),
            (202, localized(l, "取消", "Cancel", "Annuler")),
        ],
        202,
    )? == 201)
}
pub fn show_launch_error() {
    let l = locale();
    let _ = dialog(
        localized(
            l,
            "无法安全启动或更新。请检查安装登记和本地更新日志。未自动回滚或启动应用。",
            "Cannot safely launch or update. Check installation registration and local update logs. No automatic rollback or application restart occurred.",
            "Impossible de démarrer ou mettre à jour en sécurité. Vérifiez l’installation et les journaux locaux. Aucun retour arrière ni redémarrage automatique.",
        ),
        &[(202, localized(l, "关闭", "Close", "Fermer"))],
        202,
    );
}

pub fn show_preferences_warning() -> Result<(), RunnerError> {
    let l = locale();
    dialog(
        localized(
            l,
            "无法读取或保存更新偏好。本次仍会检查更新，不会永久跳过更新。",
            "Update preferences could not be read or saved. Updates will still be checked; they are not permanently skipped.",
            "Impossible de lire ou enregistrer les préférences. Les mises à jour seront toujours vérifiées ; elles ne sont pas ignorées définitivement.",
        ),
        &[(202, localized(l, "确定", "OK", "OK"))],
        202,
    ).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejected_initial_directory_junction_never_deletes_external_installer() {
        let base =
            std::env::temp_dir().join(format!("honsen-init-regression-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&base).unwrap();
        let outside = base.join("outside");
        fs::create_dir(&outside).unwrap();
        let sentinel = outside.join("installer.exe");
        fs::write(&sentinel, b"external sentinel").unwrap();
        let entry = base.join("uuid-entry");
        let output = std::process::Command::new("cmd.exe")
            .args(["/C", "mklink", "/J"])
            .arg(&entry)
            .arg(&outside)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "synthetic junction creation failed"
        );
        let result = DownloadedInstaller::finish_created_directory(
            entry.clone(),
            vec![guard_directory(&base).unwrap()],
        );
        assert!(result.is_err());
        let preserved = fs::read(&sentinel).ok();
        // Remove only the synthetic junction entry, never recurse through it.
        if entry.exists() {
            fs::remove_dir(&entry).unwrap();
        }
        if sentinel.exists() {
            fs::remove_file(&sentinel).unwrap();
        }
        fs::remove_dir(&outside).unwrap();
        fs::remove_dir(&base).unwrap();
        assert_eq!(preserved.as_deref(), Some(b"external sentinel".as_slice()));
    }
    #[test]
    fn verified_download_locks_bytes_and_directory_until_drop_but_allows_copy() {
        let mut owner = DownloadedInstaller::create().unwrap();
        let directory = owner.directory.clone();
        fs::write(owner.path(), b"synthetic installer bytes").unwrap();
        let hash = format!("{:x}", Sha256::digest(b"synthetic installer bytes"));
        owner.verify_and_hold(25, &hash).unwrap();
        assert!(fs::write(owner.path(), b"replacement").is_err());
        assert!(fs::rename(owner.path(), directory.join("renamed.exe")).is_err());
        assert!(fs::rename(&directory, directory.with_extension("renamed")).is_err());
        let copied = directory.join("copy.exe");
        fs::copy(owner.path(), &copied).unwrap();
        assert_eq!(fs::read(&copied).unwrap(), b"synthetic installer bytes");
        fs::remove_file(copied).unwrap();
        drop(owner);
        assert!(!directory.exists());
    }
    #[test]
    fn bad_download_hash_cleans_only_owned_directory_and_preserves_external_sentinel() {
        let mut owner = DownloadedInstaller::create().unwrap();
        let directory = owner.directory.clone();
        let sentinel = directory
            .parent()
            .unwrap()
            .join(format!("honsen-sentinel-{}", uuid::Uuid::new_v4()));
        fs::write(&sentinel, b"external synthetic sentinel").unwrap();
        fs::write(owner.path(), b"bad").unwrap();
        assert_eq!(
            owner.verify_and_hold(3, &"0".repeat(64)),
            Err(RunnerError::HashMismatch)
        );
        drop(owner);
        assert!(!directory.exists());
        assert_eq!(fs::read(&sentinel).unwrap(), b"external synthetic sentinel");
        fs::remove_file(sentinel).unwrap();
    }
    #[test]
    fn async_context_is_retained_through_error_until_handle_closing() {
        let (sender, receiver) = mpsc::channel();
        let state = Arc::new(AsyncState {
            sender,
            buffer: Mutex::new(Box::new([0; 65536])),
        });
        let weak = Arc::downgrade(&state);
        let raw = Arc::into_raw(state.clone()) as usize;
        drop(state);
        unsafe {
            http_callback(
                null_mut(),
                raw,
                WINHTTP_CALLBACK_STATUS_REQUEST_ERROR,
                null_mut(),
                0,
            );
        }
        assert!(matches!(receiver.recv().unwrap(), HttpEvent::Failed));
        assert!(weak.upgrade().is_some());
        unsafe {
            http_callback(
                null_mut(),
                raw,
                WINHTTP_CALLBACK_STATUS_HANDLE_CLOSING,
                null_mut(),
                0,
            );
        }
        assert!(weak.upgrade().is_none());
    }
    #[test]
    fn download_urls_reject_foreign_and_insecure_targets() {
        for url in [
            "http://github.com/etianwang/Honsen-procure/releases/download/v1/a.exe",
            "https://github.com/other/repo/releases/download/v1/a.exe",
            "https://release-assets.githubusercontent.com.evil.test/a",
            "https://u:p@github.com/etianwang/Honsen-procure/releases/download/v1/a.exe",
        ] {
            assert!(url_checked(url, false).is_err())
        }
        assert!(
            url_checked(
                "https://release-assets.githubusercontent.com/a?sig=synthetic",
                false
            )
            .is_ok()
        );
    }
    #[test]
    #[ignore = "Real native dialog: requires independent desktop interaction"]
    fn native_update_choice_probe() {
        assert!(matches!(
            choose_update("0.1.7", "0.1.8").unwrap(),
            UpdateChoice::UpdateNow
        ));
    }
    #[test]
    #[ignore = "Real native warning: requires independent desktop interaction"]
    fn native_failure_confirm_probe() {
        assert!(!confirm_local_after_failure().unwrap());
    }
    #[test]
    #[ignore = "Real French native dialog: requires independent desktop interaction"]
    fn native_french_choice_probe() {
        assert!(matches!(
            choose(Locale::Fr, "0.1.7", "0.1.8").unwrap(),
            UpdateChoice::SkipVersion
        ));
    }
    #[test]
    #[ignore = "Real English native dialog: requires independent desktop interaction"]
    fn native_english_choice_probe() {
        assert!(matches!(
            choose(Locale::En, "0.1.7", "0.1.8").unwrap(),
            UpdateChoice::RemindLater
        ));
    }
    #[test]
    #[ignore = "Real Chinese native dialog: requires independent desktop interaction"]
    fn native_chinese_choice_probe() {
        assert!(matches!(
            choose(Locale::Zh, "0.1.7", "0.1.8").unwrap(),
            UpdateChoice::RemindLater
        ));
    }
    #[test]
    #[ignore = "Real native warning: explicitly click continue"]
    fn native_failure_continue_probe() {
        assert!(confirm_local_after_failure().unwrap());
    }
    #[test]
    #[ignore = "Read-only real canonical HTTPS request; no test endpoint"]
    fn native_canonical_network_probe() {
        let start = Instant::now();
        let result = fetch_release_metadata();
        println!(
            "canonical_request_success={} elapsed_ms={}",
            result.is_ok(),
            start.elapsed().as_millis()
        );
        assert!(start.elapsed() < Duration::from_secs(17));
    }
}
