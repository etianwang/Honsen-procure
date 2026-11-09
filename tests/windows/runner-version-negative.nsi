; NEGATIVE TEST ONLY. Never include in a product bundle or publish as a release.
; Deliberately returns 0 with an old Runner, solely to exercise NEW worker checks.
Unicode true
RequestExecutionLevel admin
SilentInstall silent
AutoCloseWindow true
Name "NEGATIVE TEST ONLY - Runner PE rejection"
VIProductVersion "0.0.0.0"
VIAddVersionKey "FileDescription" "NEGATIVE TEST ONLY - not a Honsen release"
VIAddVersionKey "FileVersion" "0.0.0.0"
!ifndef OLD_RUNNER
!error "OLD_RUNNER must point to retained actual019 payload"
!endif
!ifndef CURRENT_RUNNER
!error "CURRENT_RUNNER must point to the NEW worker-bearing candidate payload"
!endif
!ifndef CURRENT_MANIFEST
!error "CURRENT_MANIFEST must point to that exact candidate manifest"
!endif
!ifndef EXPECTED_VERSION
!error "EXPECTED_VERSION required"
!endif
!ifndef EXPECTED_MS
!error "EXPECTED_MS required: major*65536+minor"
!endif
!ifndef EXPECTED_LS
!error "EXPECTED_LS required: patch*65536+revision"
!endif
!ifndef FIXTURE_OUT
!error "FIXTURE_OUT must be an isolated .cache TEST-ONLY output"
!endif
; The normal candidate manifest generator emits this exact JSON spelling.
; An inconsistent compile input is rejected, not treated as a runtime fixture.
!searchparse /file "${CURRENT_MANIFEST}" '"version": "' FIXTURE_MANIFEST_VERSION '"'
!if "${FIXTURE_MANIFEST_VERSION}" != "${EXPECTED_VERSION}"
!error "Candidate manifest version does not match EXPECTED_VERSION"
!endif
OutFile "${FIXTURE_OUT}"
InstallDir "C:\Honsen Security Synthetic\Honsen Procure"
!define FIXED_TARGET "C:\Honsen Security Synthetic\Honsen Procure"
!define APPKEY "Software\Honsen Program\Apps\honsen.procure"
Var CompareLeft
Var CompareRight
Var CompareEqual
Var Alias

; Native bounded-buffer byte comparison, no external/new plugins or scripting.
Function CompareFiles
  StrCpy $CompareEqual 0
  StrCpy $0 -1
  StrCpy $1 -1
  StrCpy $2 0
  StrCpy $3 0
  System::Call 'kernel32::CreateFileW(w "$CompareLeft", i 0x80000000, i 1, p 0, i 3, i 0x00200000, p 0) p .r0'
  StrCmp $0 -1 compare_done
  System::Call 'kernel32::CreateFileW(w "$CompareRight", i 0x80000000, i 1, p 0, i 3, i 0x00200000, p 0) p .r1'
  StrCmp $1 -1 compare_done
  System::Alloc 65536
  Pop $2
  System::Alloc 65536
  Pop $3
  StrCmp $2 0 compare_done
  StrCmp $3 0 compare_done
compare_loop:
  System::Call 'kernel32::ReadFile(p r0, p r2, i 65536, *i .r4, p 0) i .r6'
  StrCmp $6 0 compare_done
  System::Call 'kernel32::ReadFile(p r1, p r3, i 65536, *i .r5, p 0) i .r6'
  StrCmp $6 0 compare_done
  IntCmp $4 $5 0 compare_done compare_done
  IntCmp $4 0 compare_equal
  StrCpy $7 1
  System::Call 'msvcrt::memcmp(p r2, p r3, p r4) i .r7 ?c'
  StrCmp $7 0 compare_loop compare_done
compare_equal:
  StrCpy $CompareEqual 1
compare_done:
  StrCmp $0 -1 compare_close_right
  System::Call 'kernel32::CloseHandle(p r0)'
compare_close_right:
  StrCmp $1 -1 compare_free_left
  System::Call 'kernel32::CloseHandle(p r1)'
compare_free_left:
  StrCmp $2 0 compare_free_right
  System::Free $2
compare_free_right:
  StrCmp $3 0 compare_return
  System::Free $3
compare_return:
FunctionEnd

Function .onInit
  ; Account + exact synthetic path checks occur before any install mutation.
  System::Call 'advapi32::GetUserNameW(w .r0, *i ${NSIS_MAX_STRLEN}) i .r1'
  StrCmp $1 0 refuse
  StrCmp $0 "WDAGUtilityAccount" 0 refuse
  StrCmp $INSTDIR "${FIXED_TARGET}" 0 refuse
  System::Call 'kernel32::GetFileAttributesW(w "C:\Honsen Security Synthetic") i .r0'
  StrCmp $0 -1 refuse
  IntOp $1 $0 & 0x400
  StrCmp $1 0 0 refuse
  IntOp $1 $0 & 0x10
  StrCmp $1 0 refuse
  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR") i .r0'
  StrCmp $0 -1 refuse
  IntOp $1 $0 & 0x400
  StrCmp $1 0 0 refuse
  IntOp $1 $0 & 0x10
  StrCmp $1 0 refuse
  SetRegView 64
  ReadRegStr $0 HKLM "${APPKEY}" "AppId"
  StrCmp $0 "honsen.procure" 0 refuse
  ReadRegStr $0 HKLM "${APPKEY}" "InstallLocation"
  StrCmp $0 "$INSTDIR" 0 refuse
  ReadRegStr $0 HKLM "${APPKEY}" "ExecutablePath"
  StrCmp $0 "$INSTDIR\HonsenProcure.exe" 0 refuse
  ReadRegStr $0 HKLM "${APPKEY}" "UpdateRunnerPath"
  StrCmp $0 "$INSTDIR\HonsenUpdateRunner.exe" 0 refuse
  ReadRegStr $0 HKLM "${APPKEY}" "LauncherPath"
  StrCmp $0 "$INSTDIR\HonsenUpdateRunner.exe" 0 refuse
  ReadRegStr $0 HKLM "${APPKEY}" "Version"
  StrCmp $0 "${EXPECTED_VERSION}" 0 refuse
  ClearErrors
  GetDLLVersion "$INSTDIR\HonsenProcure.exe" $0 $1
  IfErrors refuse
  IntCmp $0 ${EXPECTED_MS} 0 refuse refuse
  IntCmp $1 ${EXPECTED_LS} 0 refuse refuse
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=expected-current.exe "${CURRENT_RUNNER}"
  File /oname=expected-manifest.json "${CURRENT_MANIFEST}"
  File /oname=old019.exe "${OLD_RUNNER}"
  ; Exact bytes pin the candidate Runner/Manifest more strongly than PE alone.
  StrCpy $CompareLeft "$INSTDIR\HonsenUpdateRunner.exe"
  StrCpy $CompareRight "$PLUGINSDIR\expected-current.exe"
  Call CompareFiles
  StrCmp $CompareEqual 1 0 refuse
  StrCpy $CompareLeft "$INSTDIR\honsen.app.json"
  StrCpy $CompareRight "$PLUGINSDIR\expected-manifest.json"
  Call CompareFiles
  StrCmp $CompareEqual 1 0 refuse
  ClearErrors
  GetDLLVersion "$INSTDIR\HonsenUpdateRunner.exe" $0 $1
  IfErrors refuse
  IntCmp $0 ${EXPECTED_MS} 0 refuse refuse
  IntCmp $1 ${EXPECTED_LS} 0 refuse refuse
  ; Payload is specifically old019, never a fake newly stamped production EXE.
  ClearErrors
  GetDLLVersion "$PLUGINSDIR\old019.exe" $0 $1
  IfErrors refuse
  IntCmp $0 1 0 refuse refuse
  IntCmp $1 589824 0 refuse refuse
  Return
refuse:
  SetErrorLevel 91
  Quit
FunctionEnd

Section "NEGATIVE TEST ONLY"
  System::Alloc 16
  Pop $0
  StrCmp $0 0 failed
  System::Call 'ole32::CoCreateGuid(p r0) i .r1'
  StrCmp $1 0 0 guid_failed
  System::Call 'ole32::StringFromGUID2(p r0, w .r2, i 40) i .r1'
  StrCmp $1 39 0 guid_failed
  System::Free $0
  StrCpy $2 $2 36 1
  StrCpy $Alias "$INSTDIR\.NEGATIVE-TEST-ONLY-runner-$2.exe"
  System::Call 'kernel32::GetFileAttributesW(w "$Alias") i .r0'
  StrCmp $0 -1 0 failed
  ClearErrors
  Rename "$INSTDIR\HonsenUpdateRunner.exe" "$Alias"
  IfErrors failed
  System::Call 'kernel32::CopyFileW(w "$PLUGINSDIR\old019.exe", w "$INSTDIR\HonsenUpdateRunner.exe", i 1) i .r0'
  StrCmp $0 0 failed
  StrCpy $CompareLeft "$INSTDIR\HonsenUpdateRunner.exe"
  StrCpy $CompareRight "$PLUGINSDIR\old019.exe"
  Call CompareFiles
  StrCmp $CompareEqual 1 0 failed
  ; Deliberately defective success, ONLY to prove worker rejects the wrong PE.
  ; No data/registry changes, autostart, rollback, alias cleanup or deletion.
  SetErrorLevel 0
  Quit
guid_failed:
  System::Free $0
failed:
  SetErrorLevel 92
  Quit
SectionEnd
