!ifndef HONSEN_RUNNER_INSTALL_INCLUDED
!define HONSEN_RUNNER_INSTALL_INCLUDED
!include "LogicLib.nsh"

; Private installer implementation. No public CLI/registry/result fields.
Var HR_Path
Var HR_Access
Var HR_Handle
Var HR_Error
Var HR_Ok
Var HR_Stage
Var HR_Target
Var HR_Old
Var HR_Owner
Var HR_Uuid
Var HR_ExpectedOwner
Var HR_LogHandle
Var HR_LogPath
Var HR_Phase
Var HR_Pins
Var HR_PinPath
Var HR_RootHandle
Var HR_F1
Var HR_F2
Var HR_B1
Var HR_B2
Var HR_Size1
Var HR_Size2
Var HR_Bytes
Var HR_Start
Var HR_Elapsed
Var HR_CheckVersion
Var HR_NewHandle
Var HR_OldHandle
Var HR_OwnerHandle
Var HR_Find
Var HR_Name
Var HR_SavedUuid
Var HR_Folder
Var HR_FolderFull
Var HR_FolderPart
Var HR_FolderCursor
Var HR_FolderEnd
Var HR_LogUuid
Var HR_PinBuffer

!macro HR_SAVE
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  Push $9
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  Push $R6
  Push $R7
  Push $R8
  Push $R9
!macroend
!macro HR_RESTORE
  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
  Pop $9
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro HR_COMMON P
; Open a normal single-link file without following its leaf reparse point.
; Read-only sharing prevents concurrent mutation or renaming while guarded.
Function ${P}HR_Open
  StrCpy $HR_Handle -1
  System::Call 'kernel32::CreateFileW(w "$HR_Path", i $HR_Access, i 1, p 0, i 3, i 0x00200000, p 0) p.r0 ?e'
  Pop $HR_Error
  StrCmp $0 -1 hr_open_done
  StrCpy $HR_Handle $0
  System::Alloc 52
  Pop $1
  StrCmp $1 0 hr_open_nomemory
  System::Call 'kernel32::GetFileInformationByHandle(p $HR_Handle, p r1) i.r2 ?e'
  Pop $HR_Error
  StrCmp $2 0 hr_open_bad
  System::Call '*$1(i.r2)'
  IntOp $2 $2 & 0x410
  StrCmp $2 0 0 hr_open_invalid
  IntOp $2 $1 + 40
  System::Call '*$2(i.r3)'
  StrCmp $3 1 0 hr_open_invalid
  System::Free $1
  Goto hr_open_done
hr_open_invalid:
  StrCpy $HR_Error 13
hr_open_bad:
  System::Free $1
  Goto hr_open_close
hr_open_nomemory:
  StrCpy $HR_Error 8
hr_open_close:
  System::Call 'kernel32::CloseHandle(p $HR_Handle)'
  StrCpy $HR_Handle -1
hr_open_done:
FunctionEnd

; Pins all ancestors (no SHARE_DELETE), rejects reparse directories, then checks
; the held leaf's final path. A private bounded handle array survives Section
; calls without leaving values on NSIS's caller data stack.
Function ${P}HR_Pin
  StrCpy $HR_Ok 0
  StrCmp $HR_PinBuffer "" hr_pin_allocate
  StrCmp $HR_PinBuffer 0 hr_pin_allocate hr_pin_start
hr_pin_allocate:
  IntOp $0 ${NSIS_PTR_SIZE} * 4096
  System::Alloc $0
  Pop $HR_PinBuffer
  StrCmp $HR_PinBuffer 0 hr_pin_memory
hr_pin_start:
  StrCpy $8 $HR_PinPath
  StrCpy $9 0
hr_pin_loop:
  IntOp $9 $9 + 1
  IntCmp $9 128 hr_pin_bad hr_pin_next hr_pin_bad
hr_pin_next:
  System::Call 'kernel32::CreateFileW(w r8, i 0x80, i 3, p 0, i 3, i 0x02200000, p 0) p.r0 ?e'
  Pop $HR_Error
  StrCmp $0 -1 hr_pin_bad
  StrCmp $9 1 0 +2
    StrCpy $HR_RootHandle $0
  IntCmp $HR_Pins 4096 hr_pin_close_full 0 hr_pin_close_full
  IntOp $R0 $HR_Pins * ${NSIS_PTR_SIZE}
  IntOp $R0 $HR_PinBuffer + $R0
  System::Call '*$R0(p r0)'
  IntOp $HR_Pins $HR_Pins + 1
  System::Alloc 52
  Pop $1
  StrCmp $1 0 hr_pin_memory
  System::Call 'kernel32::GetFileInformationByHandle(p r0, p r1) i.r2 ?e'
  Pop $HR_Error
  StrCmp $2 0 hr_pin_info_bad
  System::Call '*$1(i.r2)'
  System::Free $1
  IntOp $3 $2 & 0x400
  StrCmp $3 0 0 hr_pin_invalid
  IntOp $3 $2 & 0x10
  StrCmp $3 0 hr_pin_invalid
  System::Call 'kernel32::GetFullPathNameW(w "$8\..", i ${NSIS_MAX_STRLEN}, w.r7, p 0) i.r6 ?e'
  Pop $HR_Error
  StrCmp $6 0 hr_pin_bad
  IntCmp $6 ${NSIS_MAX_STRLEN} hr_pin_invalid 0 hr_pin_invalid
  StrCmp $7 $8 hr_pin_final
  StrCpy $8 $7
  Goto hr_pin_loop
hr_pin_info_bad:
  System::Free $1
  Goto hr_pin_bad
hr_pin_memory:
  StrCpy $HR_Error 8
  Goto hr_pin_bad
hr_pin_close_full:
  System::Call 'kernel32::CloseHandle(p r0)'
  StrCpy $HR_Error 8
  Goto hr_pin_bad
hr_pin_invalid:
  StrCpy $HR_Error 13
  Goto hr_pin_bad
hr_pin_final:
  System::Call 'kernel32::GetFinalPathNameByHandleW(p $HR_RootHandle, w.r7, i ${NSIS_MAX_STRLEN}, i 0) i.r6 ?e'
  Pop $HR_Error
  StrCmp $6 0 hr_pin_bad
  IntCmp $6 ${NSIS_MAX_STRLEN} hr_pin_invalid 0 hr_pin_invalid
  StrCpy $8 $7 8
  StrCmp $8 "\\?\UNC\" 0 hr_pin_dos
    StrCpy $7 $7 "" 8
    StrCpy $7 "\\$7"
    Goto hr_pin_compare
hr_pin_dos:
  StrCpy $8 $7 4
  StrCmp $8 "\\?\" 0 hr_pin_invalid
  StrCpy $7 $7 "" 4
hr_pin_compare:
  GetFullPathName $8 "$HR_PinPath"
  StrCmp $7 $8 0 hr_pin_invalid
  StrCpy $HR_Ok 1
hr_pin_bad:
FunctionEnd

Function ${P}HR_Unpin
hr_unpin_loop:
  IntCmp $HR_Pins 0 hr_unpin_done hr_unpin_done 0
  IntOp $HR_Pins $HR_Pins - 1
  IntOp $0 $HR_Pins * ${NSIS_PTR_SIZE}
  IntOp $0 $HR_PinBuffer + $0
  System::Call '*$0(p.r1)'
  System::Call 'kernel32::CloseHandle(p r1)'
  Goto hr_unpin_loop
hr_unpin_done:
  StrCmp $HR_PinBuffer 0 hr_unpin_return
  StrCmp $HR_PinBuffer "" hr_unpin_return
  System::Free $HR_PinBuffer
  StrCpy $HR_PinBuffer 0
hr_unpin_return:
FunctionEnd

; A bool is one byte in FILE_DISPOSITION_INFO. Delete by the guarded handle,
; never close a validated leaf and then issue an unprotected path Delete.
Function ${P}HR_Dispose
  StrCpy $HR_Ok 0
  System::Alloc 4
  Pop $0
  StrCmp $0 0 hr_dispose_memory
  System::Call '*$0(i 1)'
  System::Call 'kernel32::SetFileInformationByHandle(p $HR_Handle, i 4, p r0, i 1) i.r1 ?e'
  Pop $HR_Error
  System::Free $0
  StrCmp $1 0 hr_dispose_done
  StrCpy $HR_Ok 1
  StrCpy $HR_Error 0
  Goto hr_dispose_done
hr_dispose_memory:
  StrCpy $HR_Error 8
hr_dispose_done:
FunctionEnd

; Create missing components only after pinning the nearest existing ancestor,
; and pin each new component before proceeding into it.
Function ${P}HR_EnsureDirectory
  System::Call 'kernel32::GetFullPathNameW(w "$HR_Folder", i ${NSIS_MAX_STRLEN}, w.r0, p 0) i.r1 ?e'
  Pop $HR_Error
  StrCmp $1 0 hr_ensure_bad
  IntCmp $1 ${NSIS_MAX_STRLEN} hr_ensure_bad 0 hr_ensure_bad
  StrCpy $HR_FolderFull $0
  StrCpy $HR_FolderPart $HR_FolderFull
hr_ensure_existing:
  System::Call 'kernel32::GetFileAttributesW(w "$HR_FolderPart") i.r0 ?e'
  Pop $HR_Error
  StrCmp $0 -1 0 hr_ensure_pin
  StrCmp $HR_Error 2 hr_ensure_parent
  StrCmp $HR_Error 3 0 hr_ensure_bad
hr_ensure_parent:
  System::Call 'kernel32::GetFullPathNameW(w "$HR_FolderPart\..", i ${NSIS_MAX_STRLEN}, w.r1, p 0) i.r0 ?e'
  Pop $HR_Error
  StrCmp $0 0 hr_ensure_bad
  IntCmp $0 ${NSIS_MAX_STRLEN} hr_ensure_bad 0 hr_ensure_bad
  StrCmp $1 $HR_FolderPart hr_ensure_bad
  StrCpy $HR_FolderPart $1
  Goto hr_ensure_existing
hr_ensure_pin:
  StrCpy $HR_PinPath $HR_FolderPart
  Call ${P}HR_Pin
  StrCmp $HR_Ok 1 0 hr_ensure_bad
  StrLen $HR_FolderCursor $HR_FolderPart
  StrLen $HR_FolderEnd $HR_FolderFull
hr_ensure_component:
  IntCmp $HR_FolderCursor $HR_FolderEnd hr_ensure_done hr_ensure_scan hr_ensure_done
hr_ensure_scan:
  IntOp $HR_FolderCursor $HR_FolderCursor + 1
  StrCpy $0 $HR_FolderFull 1 $HR_FolderCursor
  StrCmp $0 "\" hr_ensure_make
  StrCmp $0 "" hr_ensure_make
  Goto hr_ensure_component
hr_ensure_make:
  StrCpy $HR_FolderPart $HR_FolderFull $HR_FolderCursor
  System::Call 'kernel32::CreateDirectoryW(w "$HR_FolderPart", p 0) i.r0 ?e'
  Pop $HR_Error
  StrCmp $0 0 0 hr_ensure_new_pin
  StrCmp $HR_Error 183 0 hr_ensure_bad
hr_ensure_new_pin:
  StrCpy $HR_PinPath $HR_FolderPart
  Call ${P}HR_Pin
  StrCmp $HR_Ok 1 0 hr_ensure_bad
  Goto hr_ensure_component
hr_ensure_done:
  StrCpy $HR_Ok 1
  Return
hr_ensure_bad:
  StrCpy $HR_Ok 0
FunctionEnd

Function ${P}HR_UuidValid
  StrCpy $HR_Ok 0
  StrLen $0 $HR_Uuid
  StrCmp $0 36 0 hr_uuid_done
  StrCpy $9 0
hr_uuid_char:
  IntCmp $9 36 hr_uuid_valid 0 hr_uuid_done
  StrCpy $8 $HR_Uuid 1 $9
  StrCmp $9 8 hr_uuid_dash
  StrCmp $9 13 hr_uuid_dash
  StrCmp $9 18 hr_uuid_dash
  StrCmp $9 23 hr_uuid_dash
  StrCpy $7 0
hr_uuid_hex:
  StrCpy $6 "0123456789abcdefABCDEF" 1 $7
  StrCmpS $6 "" hr_uuid_done
  StrCmpS $6 $8 hr_uuid_next
  IntOp $7 $7 + 1
  Goto hr_uuid_hex
hr_uuid_dash:
  StrCmpS $8 "-" 0 hr_uuid_done
hr_uuid_next:
  IntOp $9 $9 + 1
  Goto hr_uuid_char
hr_uuid_valid:
  StrCpy $HR_Ok 1
hr_uuid_done:
FunctionEnd

Function ${P}HR_OwnerText
  StrCpy $HR_Old "$INSTDIR\.honsen-runner-inuse-$HR_Uuid.exe"
  StrCpy $HR_Owner "$INSTDIR\.honsen-runner-inuse-$HR_Uuid.owner.ini"
  StrCpy $HR_ExpectedOwner "[Owner]$\r$\nschemaVersion=1$\r$\nappId=honsen.procure$\r$\noperationUuid=$HR_Uuid$\r$\nexactFileName=.honsen-runner-inuse-$HR_Uuid.exe$\r$\n"
FunctionEnd

; HR_OwnerHandle is already pinned. Exact length/content rejects comments,
; unknown/duplicate keys, alternate paths and trailing bytes without INI parsing.
Function ${P}HR_OwnerMatches
  StrCpy $HR_Ok 0
  StrLen $8 $HR_ExpectedOwner
  System::Call 'kernel32::GetFileSizeEx(p $HR_OwnerHandle, *l.r0) i.r1 ?e'
  Pop $HR_Error
  StrCmp $1 0 hr_owner_done
  StrCmpS $0 $8 0 hr_owner_done
  System::Alloc 1024
  Pop $7
  StrCmp $7 0 hr_owner_done
  System::Call 'kernel32::ReadFile(p $HR_OwnerHandle, p r7, i r8, *i.r0, p 0) i.r1 ?e'
  Pop $HR_Error
  StrCmp $1 0 hr_owner_free
  StrCmpS $0 $8 0 hr_owner_free
  System::Call 'msvcrt::memcmp(p r7, m "$HR_ExpectedOwner", i r8) i.r0 ?c'
  StrCmp $0 0 0 hr_owner_free
  StrCpy $HR_Ok 1
hr_owner_free:
  System::Free $7
hr_owner_done:
FunctionEnd

Function ${P}HR_Log
  StrCmp $HR_LogHandle 0 hr_log_done
  StrCmp $HR_LogHandle -1 hr_log_done
  StrCpy $R4 "schema=1 appId=honsen.procure uuid=$HR_LogUuid phase=$HR_Phase errorCode=$HR_Error bytes=$HR_Bytes elapsedMs=$HR_Elapsed$\r$\n"
  StrLen $R5 $R4
  System::Call 'kernel32::WriteFile(p $HR_LogHandle, m "$R4", i $R5, *i.r0, p 0) i.r1 ?e'
  Pop $R6
  StrCmp $1 0 hr_log_failed
  StrCmpS $0 $R5 hr_log_done
hr_log_failed:
  DetailPrint "Runner private diagnostic log write failed"
  SetErrorLevel 57
  Quit
hr_log_done:
FunctionEnd

Function ${P}HR_Init
  StrCpy $HR_Pins 0
  StrCpy $HR_PinBuffer 0
  StrCpy $HR_LogHandle 0
  StrCpy $HR_Bytes 0
  StrCpy $HR_Elapsed 0
  System::Alloc 16
  Pop $0
  StrCmp $0 0 hr_init_bad
  System::Call 'ole32::CoCreateGuid(p r0) i.r1'
  StrCmp $1 0 0 hr_init_guid_bad
  System::Call 'ole32::StringFromGUID2(p r0, w.r2, i 39) i.r1'
  StrCmp $1 39 0 hr_init_guid_bad
  System::Free $0
  StrCpy $HR_Uuid $2 36 1
  StrCpy $HR_LogUuid $HR_Uuid
  Call ${P}HR_UuidValid
  StrCmp $HR_Ok 1 0 hr_init_bad
  StrCpy $HR_Folder "$TEMP\Honsen Program\RunnerInstall"
  Call ${P}HR_EnsureDirectory
  StrCmp $HR_Ok 1 0 hr_init_bad
  StrCpy $HR_LogPath "$TEMP\Honsen Program\RunnerInstall\$HR_LogUuid"
  System::Call 'kernel32::CreateDirectoryW(w "$HR_LogPath", p 0) i.r0 ?e'
  Pop $HR_Error
  StrCmp $0 0 hr_init_bad
  StrCpy $HR_PinPath $HR_LogPath
  Call ${P}HR_Pin
  StrCmp $HR_Ok 1 0 hr_init_bad
  StrCpy $HR_LogPath "$HR_LogPath\installer.log"
  System::Call 'kernel32::CreateFileW(w "$HR_LogPath", i 0x40000000, i 1, p 0, i 1, i 0x00200080, p 0) p.r0 ?e'
  Pop $HR_Error
  StrCmp $0 -1 hr_init_bad
  StrCpy $HR_LogHandle $0
  System::Call 'kernel32::GetCurrentProcessId() i.r0'
  StrCpy $HR_Phase "begin pid=$0"
  Call ${P}HR_Log
  StrCpy $HR_Ok 1
  Return
hr_init_guid_bad:
  System::Free $0
hr_init_bad:
  StrCpy $HR_Ok 0
FunctionEnd

Function ${P}HR_Finish
  StrCmp $HR_LogHandle 0 +3
  StrCmp $HR_LogHandle -1 +2
    System::Call 'kernel32::CloseHandle(p $HR_LogHandle)'
  StrCpy $HR_LogHandle 0
  Call ${P}HR_Unpin
FunctionEnd

; Only owner records are enumerated. No wildcard Delete or recursive removal.
Function ${P}HR_CleanupRecords
  StrCpy $HR_SavedUuid $HR_Uuid
  ClearErrors
  FindFirst $HR_Find $HR_Name "$INSTDIR\.honsen-runner-inuse-*.owner.ini"
  IfErrors hr_cleanup_done
hr_cleanup_next:
  StrCpy $HR_Uuid $HR_Name 36 21
  Call ${P}HR_UuidValid
  StrCmp $HR_Ok 1 0 hr_cleanup_skip
  StrCmpS $HR_Name ".honsen-runner-inuse-$HR_Uuid.owner.ini" 0 hr_cleanup_skip
  Call ${P}HR_OwnerText
  StrCpy $HR_Path $HR_Owner
  StrCpy $HR_Access 0x80010080
  Call ${P}HR_Open
  StrCpy $HR_OwnerHandle $HR_Handle
  StrCmp $HR_Handle -1 hr_cleanup_skip
  Call ${P}HR_OwnerMatches
  StrCmp $HR_Ok 1 0 hr_cleanup_close_owner
  StrCpy $HR_Path $HR_Old
  Call ${P}HR_Open
  StrCpy $HR_OldHandle $HR_Handle
  StrCmp $HR_Handle -1 hr_cleanup_close_owner
  Call ${P}HR_Dispose
  StrCpy $8 $HR_Ok
  System::Call 'kernel32::CloseHandle(p $HR_OldHandle)'
  StrCmp $8 1 0 hr_cleanup_close_owner
  System::Call 'kernel32::GetFileAttributesW(w "$HR_Old") i.r0 ?e'
  Pop $HR_Error
  StrCmp $0 -1 0 hr_cleanup_close_owner
  StrCmp $HR_Error 2 hr_cleanup_remove_owner
  StrCmp $HR_Error 3 0 hr_cleanup_close_owner
hr_cleanup_remove_owner:
  StrCpy $HR_Handle $HR_OwnerHandle
  Call ${P}HR_Dispose
hr_cleanup_close_owner:
  System::Call 'kernel32::CloseHandle(p $HR_OwnerHandle)'
hr_cleanup_skip:
  StrCpy $HR_Phase "owner-cleanup-complete-or-retained"
  Call ${P}HR_Log
  ClearErrors
  FindNext $HR_Find $HR_Name
  IfErrors hr_cleanup_close_find
  Goto hr_cleanup_next
hr_cleanup_close_find:
  FindClose $HR_Find
hr_cleanup_done:
  StrCpy $HR_Uuid $HR_SavedUuid
FunctionEnd
!macroend
!insertmacro HR_COMMON ""
!insertmacro HR_COMMON "un."

; HR_Stage/HR_Target are private inputs. This function is also directly exercised
; by the isolated file fixture; it does not write either input.
Function HonsenRunnerCompare
  StrCpy $HR_Ok 0
  StrCpy $HR_Bytes 0
  StrCpy $HR_F1 -1
  StrCpy $HR_F2 -1
  StrCpy $HR_B1 0
  StrCpy $HR_B2 0
  System::Call 'kernel32::GetTickCount() i.r0'
  StrCpy $HR_Start $0
  StrCpy $HR_Path $HR_Stage
  StrCpy $HR_Access 0x80000000
  Call HR_Open
  StrCpy $HR_F1 $HR_Handle
  StrCmp $HR_F1 -1 hr_compare_end
  StrCpy $HR_Path $HR_Target
  Call HR_Open
  StrCpy $HR_F2 $HR_Handle
  StrCmp $HR_F2 -1 hr_compare_end
  System::Call 'kernel32::GetFileSizeEx(p $HR_F1, *l.r0) i.r1 ?e'
  Pop $HR_Error
  StrCmp $1 0 hr_compare_end
  StrCpy $HR_Size1 $0
  System::Call 'kernel32::GetFileSizeEx(p $HR_F2, *l.r0) i.r1 ?e'
  Pop $HR_Error
  StrCmp $1 0 hr_compare_end
  StrCpy $HR_Size2 $0
  StrCmpS $HR_Size1 $HR_Size2 0 hr_compare_mismatch
  System::Int64Op $HR_Size1 > 1073741824
  Pop $0
  StrCmp $0 0 0 hr_compare_mismatch
  System::Alloc 65536
  Pop $HR_B1
  System::Alloc 65536
  Pop $HR_B2
  StrCmp $HR_B1 0 hr_compare_memory
  StrCmp $HR_B2 0 hr_compare_memory
hr_compare_loop:
  System::Call 'kernel32::ReadFile(p $HR_F1, p $HR_B1, i 65536, *i.r2, p 0) i.r4 ?e'
  Pop $HR_Error
  StrCmp $4 0 hr_compare_end
  System::Call 'kernel32::ReadFile(p $HR_F2, p $HR_B2, i 65536, *i.r3, p 0) i.r5 ?e'
  Pop $HR_Error
  StrCmp $5 0 hr_compare_end
  StrCmp $2 $3 0 hr_compare_mismatch
  StrCmp $2 0 hr_compare_eof
  System::Call 'msvcrt::memcmp(p $HR_B1, p $HR_B2, i r2) i.r6 ?c'
  StrCmp $6 0 0 hr_compare_mismatch
  IntOp $HR_Bytes $HR_Bytes + $2
  System::Call 'kernel32::GetTickCount() i.r0'
  IntOp $HR_Elapsed $0 - $HR_Start
  IntCmp $HR_Elapsed 120000 hr_compare_timeout hr_compare_loop hr_compare_timeout
hr_compare_eof:
  StrCmpS $HR_Bytes $HR_Size1 0 hr_compare_mismatch
  StrCmp $HR_CheckVersion 1 0 hr_compare_pass
  ClearErrors
  GetDLLVersion "$HR_Stage" $0 $1
  IfErrors hr_compare_mismatch
  GetDLLVersion "$HR_Target" $2 $3
  IfErrors hr_compare_mismatch
  StrCmpS $0 $2 0 hr_compare_mismatch
  StrCmpS $1 $3 0 hr_compare_mismatch
  IntOp $4 $0 >> 16
  IntOp $4 $4 & 0xffff
  IntOp $5 $0 & 0xffff
  IntOp $6 $1 >> 16
  IntOp $6 $6 & 0xffff
  IntOp $7 $1 & 0xffff
  StrCmpS "$4.$5.$6.$7" "${VERSIONWITHBUILD}" 0 hr_compare_mismatch
hr_compare_pass:
  StrCpy $HR_Ok 1
  StrCpy $HR_Error 0
  Goto hr_compare_end
hr_compare_memory:
  StrCpy $HR_Error 8
  Goto hr_compare_end
hr_compare_timeout:
  StrCpy $HR_Error 1460
  Goto hr_compare_end
hr_compare_mismatch:
  StrCpy $HR_Error 13
hr_compare_end:
  StrCmp $HR_F1 -1 +2
    System::Call 'kernel32::CloseHandle(p $HR_F1)'
  StrCmp $HR_F2 -1 +2
    System::Call 'kernel32::CloseHandle(p $HR_F2)'
  StrCmp $HR_B1 0 +2
    System::Free $HR_B1
  StrCmp $HR_B2 0 +2
    System::Free $HR_B2
  System::Call 'kernel32::GetTickCount() i.r0'
  IntOp $HR_Elapsed $0 - $HR_Start
FunctionEnd
; Entry points preserve template registers and retain heap-backed directory pins.
Function HonsenRunnerBegin
 !insertmacro HR_SAVE
 StrCpy $HR_NewHandle -1
 StrCpy $HR_OldHandle -1
 StrCpy $HR_OwnerHandle -1
 Call HR_Init
 StrCmp $HR_Ok 1 0 hr_begin_fail
 StrCpy $HR_Folder $INSTDIR
 Call HR_EnsureDirectory
 StrCmp $HR_Ok 1 0 hr_begin_fail
 StrCpy $HR_Phase "installation-root-pinned"
 Call HR_Log
 !insertmacro HR_RESTORE
 Return
hr_begin_fail:
 StrCpy $HR_Phase "installation-root-rejected"
 Call HR_Log
 Call HR_Finish
 !insertmacro HR_RESTORE
 SetErrorLevel 58
 Quit
FunctionEnd

Function HonsenRunnerPublish
 !insertmacro HR_SAVE
 StrCpy $HR_Phase "payload-validation"
 StrCpy $HR_PinPath $PLUGINSDIR
 Call HR_Pin
 StrCmp $HR_Ok 1 0 hr_publish_fail
 StrCpy $HR_Stage "$PLUGINSDIR\honsen-runner.payload.exe"
 StrCpy $HR_Target $HR_Stage
 StrCpy $HR_CheckVersion 1
 Call HonsenRunnerCompare
 StrCmp $HR_Ok 1 0 hr_publish_fail
 StrCpy $HR_Path $HR_Stage
 StrCpy $HR_Access 0x80000000
 Call HR_Open
 StrCpy $HR_RootHandle $HR_Handle
 StrCmp $HR_Handle -1 hr_publish_fail
 StrCpy $HR_Target "$INSTDIR\HonsenUpdateRunner.exe"
 System::Call 'kernel32::GetFileAttributesW(w "$HR_Target") i.r0 ?e'
 Pop $HR_Error
 StrCmp $0 -1 hr_publish_no_old
 StrCpy $HR_Path $HR_Target
 StrCpy $HR_Access 0x80010080
 Call HR_Open
 StrCpy $HR_OldHandle $HR_Handle
 StrCmp $HR_Handle -1 hr_publish_fail_guard
 StrCpy $HR_Uuid $HR_LogUuid
 Call HR_OwnerText
 System::Call 'kernel32::CreateFileW(w "$HR_Owner", i 0xc0010000, i 1, p 0, i 1, i 0x00200080, p 0) p.r0 ?e'
 Pop $HR_Error
 StrCpy $HR_OwnerHandle $0
 StrCmp $0 -1 hr_publish_fail_guard
 StrLen $0 $HR_Old
 IntOp $0 $0 * 2
 IntOp $1 $0 + 12
 System::Alloc 2060
 Pop $2
 StrCmp $2 0 hr_publish_rename_memory
 System::Call '*$2(i 0, p 0, i r0)'
 IntOp $3 $2 + 12
 System::Call '*$3(&w1024 "$HR_Old")'
 StrCpy $HR_Phase "rename-mapped-runner"
 System::Call 'kernel32::SetFileInformationByHandle(p $HR_OldHandle, i 3, p r2, i r1) i.r4 ?e'
 Pop $HR_Error
 System::Free $2
 StrCmp $4 0 hr_publish_rename_fail
 StrLen $0 $HR_ExpectedOwner
 System::Call 'kernel32::WriteFile(p $HR_OwnerHandle, m "$HR_ExpectedOwner", i r0, *i.r1, p 0) i.r2 ?e'
 Pop $HR_Error
 StrCmp $2 0 hr_publish_fail_guard
 StrCmpS $0 $1 0 hr_publish_owner_bad
 System::Call 'kernel32::FlushFileBuffers(p $HR_OwnerHandle) i.r0 ?e'
 Pop $HR_Error
 StrCmp $0 0 hr_publish_fail_guard
 Goto hr_publish_copy
hr_publish_no_old:
 StrCmp $HR_Error 2 hr_publish_copy
 StrCmp $HR_Error 3 0 hr_publish_fail_guard
hr_publish_copy:
 StrCpy $HR_Phase "publish-create-new"
 System::Call 'kernel32::CopyFileW(w "$HR_Stage", w "$HR_Target", i 1) i.r0 ?e'
 Pop $HR_Error
 StrCmp $0 0 hr_publish_fail_guard
 StrCpy $HR_Path $HR_Target
 StrCpy $HR_Access 0x80000000
 Call HR_Open
 StrCpy $HR_NewHandle $HR_Handle
 StrCmp $HR_Handle -1 hr_publish_fail_guard
 Call HonsenRunnerCompare
 StrCmp $HR_Ok 1 0 hr_publish_fail_guard
 StrCpy $HR_Phase "payload-bytes-and-version-verified"
 Call HR_Log
 System::Call 'kernel32::CloseHandle(p $HR_RootHandle)'
 !insertmacro HR_RESTORE
 Return
hr_publish_rename_memory:
 StrCpy $HR_Error 8
hr_publish_rename_fail:
 StrCpy $5 $HR_Error
 StrCpy $HR_Handle $HR_OwnerHandle
 Call HR_Dispose
 StrCpy $HR_Error $5
 Goto hr_publish_fail_guard
hr_publish_owner_bad:
 StrCpy $HR_Error 13
hr_publish_fail_guard:
 System::Call 'kernel32::CloseHandle(p $HR_RootHandle)'
hr_publish_fail:
 Call HR_Log
 StrCmp $HR_NewHandle -1 +2
  System::Call 'kernel32::CloseHandle(p $HR_NewHandle)'
 StrCmp $HR_OldHandle -1 +2
  System::Call 'kernel32::CloseHandle(p $HR_OldHandle)'
 StrCmp $HR_OwnerHandle -1 +2
  System::Call 'kernel32::CloseHandle(p $HR_OwnerHandle)'
 Call HR_Finish
 !insertmacro HR_RESTORE
 SetErrorLevel 59
 Quit
FunctionEnd

Function HonsenRunnerFinish
 !insertmacro HR_SAVE
 StrCmp $HR_NewHandle -1 +2
  System::Call 'kernel32::CloseHandle(p $HR_NewHandle)'
 StrCpy $HR_NewHandle -1
 StrCmp $HR_OldHandle -1 +2
  System::Call 'kernel32::CloseHandle(p $HR_OldHandle)'
 StrCmp $HR_OwnerHandle -1 +2
  System::Call 'kernel32::CloseHandle(p $HR_OwnerHandle)'
 StrCpy $HR_OldHandle -1
 StrCpy $HR_OwnerHandle -1
 Call HR_CleanupRecords
 StrCpy $HR_Phase "installation-runner-complete"
 StrCpy $HR_Error 0
 Call HR_Log
 Call HR_Finish
 !insertmacro HR_RESTORE
FunctionEnd
Function HonsenRunnerAbort
 StrCpy $HR_Phase "payload-extraction-failed"
 StrCpy $HR_Error 13
 Call HR_Log
 Call HR_Finish
 SetErrorLevel 60
 Quit
FunctionEnd
Function un.HonsenRunnerCleanup
 !insertmacro HR_SAVE
 Call un.HR_Init
 StrCmp $HR_Ok 1 0 hr_uninstall_fail
 StrCpy $HR_PinPath $INSTDIR
 Call un.HR_Pin
 StrCmp $HR_Ok 1 0 hr_uninstall_fail
 Call un.HR_CleanupRecords
 Call un.HR_Finish
 !insertmacro HR_RESTORE
 Return
hr_uninstall_fail:
 StrCpy $HR_Phase "uninstall-cleanup-rejected"
 Call un.HR_Log
 Call un.HR_Finish
 !insertmacro HR_RESTORE
 SetErrorLevel 61
 Quit
FunctionEnd
!endif