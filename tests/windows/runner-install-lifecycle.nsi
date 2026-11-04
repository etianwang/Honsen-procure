; Isolated installer helper fixture. Compile only with explicit disposable paths.
Unicode true
SilentInstall silent
RequestExecutionLevel user
!ifndef FIXTURE_ROOT
 !error "FIXTURE_ROOT must name a new isolated directory"
!endif
!ifndef PAYLOAD_PATH
 !error "PAYLOAD_PATH must name a verified test Runner"
!endif
!ifndef VERSIONWITHBUILD
 !error "VERSIONWITHBUILD must be the test payload PE version"
!endif
!include "..\..\apps\desktop\src-tauri\packaging\windows\runner-install.nsh"
OutFile "${FIXTURE_ROOT}\lifecycle.exe"
Section
 StrCpy $INSTDIR "${FIXTURE_ROOT}\install"
 Call HonsenRunnerBegin
 InitPluginsDir
 SetOutPath $PLUGINSDIR
 File /oname=honsen-runner.payload.exe "${PAYLOAD_PATH}"
 Call HonsenRunnerPublish
 FileOpen $9 "${FIXTURE_ROOT}\result.txt" w
 ; The new fixed Runner must remain pinned through registration/Finish.
 System::Call 'kernel32::CreateFileW(w "$HR_Target", i 0x40000000, i 7, p 0, i 3, i 0, p 0) p.r0 ?e'
 Pop $1
 FileWrite $9 "writeDuringPublishHandle=$0 error=$1$\r$\n"
 StrCmp $0 -1 0 failed_open
 StrCmp $1 32 0 failed
 System::Call 'kernel32::CreateFileW(w "$HR_Target", i 0x10000, i 7, p 0, i 3, i 0, p 0) p.r0 ?e'
 Pop $1
 FileWrite $9 "deleteDuringPublishHandle=$0 error=$1$\r$\n"
 StrCmp $0 -1 0 failed_open
 StrCmp $1 32 0 failed
 Call HonsenRunnerFinish
 System::Call 'kernel32::CreateFileW(w "$HR_Target", i 0x40000000, i 7, p 0, i 3, i 0, p 0) p.r0 ?e'
 Pop $1
 FileWrite $9 "writeAfterFinishHandle=$0 error=$1$\r$\n"
 StrCmp $0 -1 failed
 System::Call 'kernel32::CloseHandle(p r0)'
 FileWrite $9 "PASS sourceBytes=$HR_Bytes$\r$\n"
 FileClose $9
 SetErrorLevel 0
 Goto done
failed_open:
 System::Call 'kernel32::CloseHandle(p r0)'
failed:
 FileWrite $9 "FAIL$\r$\n"
 FileClose $9
 SetErrorLevel 62
done:
SectionEnd