[CmdletBinding()]
param(
  [ValidateSet('Full', 'Read')]
  [string]$Action = 'Full',
  [string]$Target,
  [ValidateSet('Enterprise', 'LocalMachine')]
  [string]$Persist = 'Enterprise',
  [switch]$KeyringShape
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

public static class HonsenCredentialProbe {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public UInt32 LastWrittenLow;
    public UInt32 LastWrittenHigh;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }

  public sealed class Result {
    public bool Success;
    public int Win32Error;
    public UInt32 Type;
    public UInt32 Persist;
    public string Target;
    public string UserName;
    public UInt32 BlobSize;
    public string BlobSha256;
  }

  [DllImport("Advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWriteW(ref CREDENTIAL credential, UInt32 flags);
  [DllImport("Advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredReadW(string target, UInt32 type, UInt32 flags, out IntPtr credential);
  [DllImport("Advapi32.dll", SetLastError = true)]
  static extern bool CredDeleteW(string target, UInt32 type, UInt32 flags);
  [DllImport("Advapi32.dll")]
  static extern void CredFree(IntPtr buffer);

  static Result Failure(string target, int error) {
    return new Result { Success = false, Win32Error = error, Target = target };
  }

  static string Hash(byte[] bytes) {
    using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "");
  }

  public static Result Write(string target, string username, string comment, UInt32 persist, byte[] secret) {
    IntPtr targetPointer = IntPtr.Zero, usernamePointer = IntPtr.Zero, commentPointer = IntPtr.Zero, blobPointer = IntPtr.Zero;
    try {
      targetPointer = Marshal.StringToCoTaskMemUni(target);
      usernamePointer = Marshal.StringToCoTaskMemUni(username);
      commentPointer = Marshal.StringToCoTaskMemUni(comment);
      blobPointer = Marshal.AllocHGlobal(secret.Length);
      Marshal.Copy(secret, 0, blobPointer, secret.Length);
      var credential = new CREDENTIAL {
        Type = 1, TargetName = targetPointer, UserName = usernamePointer, Comment = commentPointer,
        CredentialBlobSize = (UInt32)secret.Length, CredentialBlob = blobPointer, Persist = persist
      };
      if (!CredWriteW(ref credential, 0)) return Failure(target, Marshal.GetLastWin32Error());
      return new Result { Success = true, Type = credential.Type, Persist = credential.Persist, Target = target, UserName = username, BlobSize = credential.CredentialBlobSize, BlobSha256 = Hash(secret) };
    } finally {
      Array.Clear(secret, 0, secret.Length);
      if (targetPointer != IntPtr.Zero) Marshal.FreeCoTaskMem(targetPointer);
      if (usernamePointer != IntPtr.Zero) Marshal.FreeCoTaskMem(usernamePointer);
      if (commentPointer != IntPtr.Zero) Marshal.FreeCoTaskMem(commentPointer);
      if (blobPointer != IntPtr.Zero) Marshal.FreeHGlobal(blobPointer);
    }
  }

  public static Result Read(string target) {
    IntPtr pointer;
    if (!CredReadW(target, 1, 0, out pointer)) return Failure(target, Marshal.GetLastWin32Error());
    try {
      var credential = Marshal.PtrToStructure<CREDENTIAL>(pointer);
      var bytes = new byte[credential.CredentialBlobSize];
      Marshal.Copy(credential.CredentialBlob, bytes, 0, bytes.Length);
      var result = new Result { Success = true, Type = credential.Type, Persist = credential.Persist, Target = Marshal.PtrToStringUni(credential.TargetName), UserName = Marshal.PtrToStringUni(credential.UserName), BlobSize = credential.CredentialBlobSize, BlobSha256 = Hash(bytes) };
      Array.Clear(bytes, 0, bytes.Length);
      return result;
    } finally { CredFree(pointer); }
  }

  public static Result Delete(string target) {
    if (!CredDeleteW(target, 1, 0)) return Failure(target, Marshal.GetLastWin32Error());
    return new Result { Success = true, Type = 1, Target = target };
  }
}
'@

function Persist-Value([string]$Name) {
  if ($Name -eq 'Enterprise') { return [uint32]3 }
  return [uint32]2
}

if ($Action -eq 'Read') {
  if ([string]::IsNullOrWhiteSpace($Target)) { throw 'Read requires a controlled target' }
  [HonsenCredentialProbe]::Read($Target) | ConvertTo-Json -Compress
  exit
}

$target = if ($KeyringShape) { "10000000-0000-4000-8000-000000000011.S-$([Guid]::NewGuid().ToString('N').Substring(0, 8))" } else { "HonsenProcure.NativeQA.$([Guid]::NewGuid().ToString('N'))" }
$username = if ($KeyringShape) { '10000000-0000-4000-8000-000000000011' } else { 'honsen-native-qa-controlled' }
$comment = if ($KeyringShape) { 'keyring v3.6.3' } else { 'Honsen native QA controlled credential' }
if ($KeyringShape) {
  $secret = [System.Text.Encoding]::Unicode.GetBytes([Guid]::NewGuid().ToString('N'))
} else {
  $secret = New-Object byte[] 48
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($secret) } finally { $rng.Dispose() }
}
$persistValue = Persist-Value $Persist
try {
  $written = [HonsenCredentialProbe]::Write($target, $username, $comment, $persistValue, $secret)
  $sameProcess = [HonsenCredentialProbe]::Read($target)
  $childOutput = & (Get-Process -Id $PID).Path -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Action Read -Target $target
  $crossProcess = $childOutput | ConvertFrom-Json
  $passed = $written.Success -and $sameProcess.Success -and $crossProcess.Success -and $written.BlobSha256 -eq $sameProcess.BlobSha256 -and $written.BlobSha256 -eq $crossProcess.BlobSha256
  [pscustomobject]@{
    action = 'Full'; result = if ($passed) { 'PASS' } else { 'FAIL' }; persist = $Persist; keyringShape = [bool]$KeyringShape; write = $written; sameProcessRead = $sameProcess; crossProcessRead = $crossProcess
  } | ConvertTo-Json -Depth 4 -Compress
  if (!$passed) { exit 1 }
} finally {
  $deleted = [HonsenCredentialProbe]::Delete($target)
  if (!$deleted.Success -and $deleted.Win32Error -ne 1168) { throw "cannot delete controlled credential; Win32=$($deleted.Win32Error)" }
}
