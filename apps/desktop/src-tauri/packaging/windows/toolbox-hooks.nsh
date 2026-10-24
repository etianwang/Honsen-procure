!macro HonsenWriteRegistry
  SetRegView 64
  WriteRegStr HKLM "Software\Honsen Program\Apps\honsen.procure" "AppId" "honsen.procure"
  WriteRegStr HKLM "Software\Honsen Program\Apps\honsen.procure" "DisplayName" "Honsen Procure"
  WriteRegStr HKLM "Software\Honsen Program\Apps\honsen.procure" "Version" "${VERSION}"
  WriteRegStr HKLM "Software\Honsen Program\Apps\honsen.procure" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Honsen Program\Apps\honsen.procure" "ExecutablePath" "$INSTDIR\HonsenProcure.exe"
  WriteRegStr HKLM "Software\Honsen Program\Apps\honsen.procure" "LauncherPath" "$INSTDIR\HonsenUpdateRunner.exe"
  WriteRegStr HKLM "Software\Honsen Program\Apps\honsen.procure" "UpdateRunnerPath" "$INSTDIR\HonsenUpdateRunner.exe"
  WriteRegStr HKLM "Software\Honsen Program\Apps\honsen.procure" "UpdateManifestUrl" "${HONSEN_UPDATE_MANIFEST_URL}"
  WriteRegStr HKLM "Software\Honsen Program\Apps\honsen.procure" "UpdateUrl" "${HONSEN_UPDATE_MANIFEST_URL}"
  WriteRegStr HKLM "Software\Honsen Program\Apps\honsen.procure" "InstallScope" "machine"
  WriteRegStr HKLM "Software\Honsen Program\Apps\honsen.procure" "Publisher" "Honsen"
!macroend

!macro HonsenWriteUninstallRegistry
  SetRegView 64
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HonsenProcure" "DisplayName" "Honsen Procure"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HonsenProcure" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HonsenProcure" "Publisher" "Honsen"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HonsenProcure" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HonsenProcure" "DisplayIcon" "$INSTDIR\HonsenProcure.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HonsenProcure" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HonsenProcure" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HonsenProcure" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HonsenProcure" "NoRepair" 1
!macroend

!define HONSEN_UPDATE_MANIFEST_URL "https://github.com/etianwang/Honsen-procure/releases/latest/download/manifest.json"

!macro HonsenRejectOtherInstall key view
  SetRegView ${view}
  ReadRegStr $0 ${key} "Software\Honsen Program\Apps\honsen.procure" "ExecutablePath"
  IfFileExists "$0" 0 +4
    StrCmp "$0" "$INSTDIR\HonsenProcure.exe" +3
      MessageBox MB_ICONSTOP|MB_OK "Honsen Procure is already installed at $0. Updates must use that installation directory."
      Abort
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro HonsenRejectOtherInstall HKLM 64
  !insertmacro HonsenRejectOtherInstall HKLM 32
  !insertmacro HonsenRejectOtherInstall HKCU 64
  !insertmacro HonsenRejectOtherInstall HKCU 32
!macroend

!macro NSIS_HOOK_POSTINSTALL
  CopyFiles /SILENT "$INSTDIR\resources\HonsenUpdateRunner.exe" "$INSTDIR\HonsenUpdateRunner.exe"
  CopyFiles /SILENT "$INSTDIR\resources\honsen.app.json" "$INSTDIR\honsen.app.json"
  Delete "$INSTDIR\resources\HonsenUpdateRunner.exe"
  Delete "$INSTDIR\resources\honsen.app.json"
  !insertmacro HonsenWriteRegistry
  !insertmacro HonsenWriteUninstallRegistry
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  SetRegView 64
  ReadRegStr $0 HKLM "Software\Honsen Program\Apps\honsen.procure" "AppId"
  StrCmp "$0" "honsen.procure" 0 +2
    DeleteRegKey HKLM "Software\Honsen Program\Apps\honsen.procure"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HonsenProcure"
  SetRegView 32
  DeleteRegKey HKLM "Software\Honsen Program\Apps\honsen.procure"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HonsenProcure"
!macroend
