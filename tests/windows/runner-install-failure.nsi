; Test-only actual Windows alias collision against the unmodified helper.
Unicode true
SilentInstall silent
RequestExecutionLevel user
!ifndef FIXTURE_ROOT
 !error "Explicit disposable FIXTURE_ROOT is required"
!endif
!ifndef PAYLOAD_PATH
 !error "Explicit immutable test PAYLOAD_PATH is required"
!endif
!ifndef VERSIONWITHBUILD
 !error "Explicit payload VERSIONWITHBUILD is required"
!endif
!include "..\..\apps\desktop\src-tauri\packaging\windows\runner-install.nsh"
OutFile "${FIXTURE_ROOT}\failure.exe"
Section
 StrCpy $INSTDIR "${FIXTURE_ROOT}\install"
 Call HonsenRunnerBegin
 InitPluginsDir
 SetOutPath $PLUGINSDIR
 File /oname=honsen-runner.payload.exe "${PAYLOAD_PATH}"
 ; Preplant an unknown alias with this operation UUID. The helper must neither
 ; overwrite nor delete it and must remove only its own newly reserved receipt.
 StrCpy $HR_Uuid $HR_LogUuid
 Call HR_OwnerText
 !ifndef COPY_DENIED
 System::Call 'kernel32::CreateFileW(w "$HR_Old", i 0x40000000, i 1, p 0, i 1, i 0x00200080, p 0) p.r0 ?e'
 Pop $1
 StrCmp $0 -1 fixture_setup_fail
 System::Call 'kernel32::WriteFile(p r0, m "UNKNOWN-ALIAS-KEEP", i 18, *i.r1, p 0) i.r2'
 System::Call 'kernel32::CloseHandle(p r0)'
 StrCmp $2 0 fixture_setup_fail
 StrCmp $1 18 0 fixture_setup_fail
 !endif
 FileOpen $9 "${FIXTURE_ROOT}\fixture-paths.txt" w
 FileWrite $9 "$HR_Old$\r$\n$HR_Owner$\r$\n$HR_LogPath$\r$\n"
 FileClose $9
 Call HonsenRunnerPublish
 ; Reaching here would mean a collision was incorrectly accepted.
 Call HonsenRunnerFinish
 SetErrorLevel 91
 Quit
fixture_setup_fail:
 Call HR_Finish
 SetErrorLevel 92
 Quit
SectionEnd