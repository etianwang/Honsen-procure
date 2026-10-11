# Initial Master-data Code Approval

Use this checklist to approve the immutable codes before any initial master-data record is created. Codes cannot be changed through update APIs; a correction requires deactivation and a new code.

**Approved by product owner:** 2026-10-10. These are deployment inputs, not database migration seed data: a permitted user creates them through the audited master-data workflow.

The approved display names, sites, departments and teams are in [INITIAL-MASTER-DATA.md](INITIAL-MASTER-DATA.md). Do not infer a code from a display name. `CI` and `Bethel2` are the only spellings evidenced by the approved document-number example; all other values need explicit approval.

```yaml
countries:
  - displayName: Côte d’Ivoire
    code: CI
    timeZone: Africa/Abidjan
  - displayName: Cameroon
    code: CM
    timeZone: Africa/Douala
  - displayName: Ethiopia
    code: ET
    timeZone: Africa/Addis_Ababa

projects:
  - displayName: Bethel2 office building project
    countryCode: CI
    code: Bethel2
  - displayName: Kerene villa project
    countryCode: CI
    code: Kerene
  - displayName: Mori office
    countryCode: CI
    code: Mori
  - displayName: Minrex data center
    countryCode: CM
    code: Minrex
  - displayName: Marriott hotel
    countryCode: ET
    code: Marriott

sites:
  - { projectCode: Bethel2, code: BETHEL2-SITE, displayName: Bethel2工地 }
  - { projectCode: Kerene, code: KERENE-SITE, displayName: Kerene工地 }
  - { projectCode: Mori, code: MORI-SITE, displayName: 莫里办公室 }
  - { projectCode: Minrex, code: MINREX-SITE, displayName: Minrex数据中心 }
  - { projectCode: Marriott, code: MARRIOTT-SITE, displayName: 万豪酒店 }

departments:
  - { code: CI-PD, displayName: 科特迪瓦项目部 }
  - { code: CM-PD, displayName: 喀麦隆项目部 }
  - { code: ET-PD, displayName: 埃塞项目部 }

teams:
  - { departmentCode: CI-PD, code: CI-PD-HVAC, displayName: 暖通 }
  - { departmentCode: CI-PD, code: CI-PD-PLUMBING, displayName: 给排水 }
  - { departmentCode: CI-PD, code: CI-PD-ELECTRICAL, displayName: 电气 }
  - { departmentCode: CI-PD, code: CI-PD-ELV, displayName: 弱电 }
  - { departmentCode: CI-PD, code: CI-PD-FACADE, displayName: 幕墙 }
  - { departmentCode: CI-PD, code: CI-PD-FITOUT, displayName: 精装 }
  - { departmentCode: CI-PD, code: CI-PD-FIRE, displayName: 消防 }
  - { departmentCode: CI-PD, code: CI-PD-CIVIL, displayName: 土建 }
  - { departmentCode: CM-PD, code: CM-PD-HVAC, displayName: 暖通 }
  - { departmentCode: CM-PD, code: CM-PD-PLUMBING, displayName: 给排水 }
  - { departmentCode: CM-PD, code: CM-PD-ELECTRICAL, displayName: 电气 }
  - { departmentCode: CM-PD, code: CM-PD-ELV, displayName: 弱电 }
  - { departmentCode: CM-PD, code: CM-PD-FACADE, displayName: 幕墙 }
  - { departmentCode: CM-PD, code: CM-PD-FITOUT, displayName: 精装 }
  - { departmentCode: CM-PD, code: CM-PD-FIRE, displayName: 消防 }
  - { departmentCode: CM-PD, code: CM-PD-CIVIL, displayName: 土建 }
  - { departmentCode: ET-PD, code: ET-PD-FACADE, displayName: 幕墙 }
  - { departmentCode: ET-PD, code: ET-PD-FITOUT, displayName: 精装 }

units:
  - { code: M, displayName: 米 }
  - { code: T, displayName: 吨 }
  - { code: BUNDLE, displayName: 捆 }
  - { code: PCS, displayName: 个 }
  - { code: BAG, displayName: 袋 }
  - { code: SET, displayName: 套 }
  - { code: ROLL, displayName: 卷 }

taxTemplates:
  - {
      code: CI-TVA18,
      displayName: 科特迪瓦消费税 18%,
      countryCode: CI,
      rateBasisPoints: 1800,
      effectiveAt: 2026-10-10,
    }
```

After approval, a super administrator, administrator or purchaser creates records through the authenticated master-data API. The creation is audited; names, active state and defaults may later change, but `businessCode` remains fixed.
