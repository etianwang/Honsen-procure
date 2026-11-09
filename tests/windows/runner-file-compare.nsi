; Host-only synthetic file regression. No registry, installer or lifecycle calls.
Unicode true
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
Name "Honsen TEST ONLY runner file comparison"
!ifndef TEST_ROOT
!error "TEST_ROOT must be a fresh repository .cache directory"
!endif
!ifndef AUTHORIZED_CACHE
!error "AUTHORIZED_CACHE must be the controller-resolved repository .cache root with trailing separator"
!endif
!ifndef HELPER_FILE
!error "HELPER_FILE must be the exact reviewed runner-install.nsh"
!endif
!ifndef FIXTURE_OUT
!error "FIXTURE_OUT required inside TEST_ROOT"
!endif
!ifndef CHECK_VERSION
!define CHECK_VERSION 0
!endif
!ifndef EXPECTED_OK
!error "EXPECTED_OK required"
!endif
!ifndef VERSIONWITHBUILD
!error "VERSIONWITHBUILD required even for byte-only cases"
!endif
!if ${CHECK_VERSION} != 0
!if ${CHECK_VERSION} != 1
!error "Invalid CHECK_VERSION"
!endif
!endif
OutFile "${FIXTURE_OUT}"
!include "${HELPER_FILE}"

Function .onInit
  ; The controller resolves this from its repository root, not a system path.
  ; Refuse running from a copied location or outside that authorized cache.
  StrCmp $EXEDIR "${TEST_ROOT}" 0 refuse
  StrLen $1 "${AUTHORIZED_CACHE}"
  IntCmp $1 0 refuse
  StrCpy $0 "$EXEDIR" $1
  StrCmp $0 "${AUTHORIZED_CACHE}" 0 refuse
  IfFileExists "${TEST_ROOT}\result.ini" refuse
  StrCpy $HR_Pins 0
  StrCpy $HR_PinBuffer 0
  StrCpy $HR_PinPath "${TEST_ROOT}"
  Call HR_Pin
  StrCmp $HR_Ok 1 0 unpin_refuse
  Return
unpin_refuse:
  Call HR_Unpin
refuse:
  SetErrorLevel 93
  Quit
FunctionEnd

Section "Compare only"
  StrCpy $HR_Stage "${TEST_ROOT}\left.bin"
  StrCpy $HR_Target "${TEST_ROOT}\right.bin"
  StrCpy $HR_CheckVersion ${CHECK_VERSION}
  Call HonsenRunnerCompare
  ; Capture before HR_Unpin can change scratch state. Inputs are never written.
  FileOpen $9 "${TEST_ROOT}\result.ini" w
  IfErrors log_failed
  FileWrite $9 "[Compare]$\r$\nok=$HR_Ok$\r$\nerror=$HR_Error$\r$\nbytes=$HR_Bytes$\r$\nelapsedMs=$HR_Elapsed$\r$\n"
  FileClose $9
  StrCpy $R9 $HR_Ok
  Call HR_Unpin
  StrCmp $R9 ${EXPECTED_OK} passed
  SetErrorLevel 94
  Quit
log_failed:
  Call HR_Unpin
  SetErrorLevel 95
  Quit
passed:
  SetErrorLevel 0
SectionEnd
