import ctypes as c, ctypes.wintypes as w, json, uuid
adv=c.WinDLL('Advapi32', use_last_error=True)
class FILETIME(c.Structure): _fields_=[('low',w.DWORD),('high',w.DWORD)]
class CREDENTIAL(c.Structure): _fields_=[('Flags',w.DWORD),('Type',w.DWORD),('TargetName',w.LPWSTR),('Comment',w.LPWSTR),('LastWritten',FILETIME),('CredentialBlobSize',w.DWORD),('CredentialBlob',c.POINTER(c.c_ubyte)),('Persist',w.DWORD),('AttributeCount',w.DWORD),('Attributes',c.c_void_p),('TargetAlias',w.LPWSTR),('UserName',w.LPWSTR)]
adv.CredWriteW.argtypes=[c.POINTER(CREDENTIAL),w.DWORD]; adv.CredWriteW.restype=w.BOOL
adv.CredDeleteW.argtypes=[w.LPCWSTR,w.DWORD,w.DWORD]; adv.CredDeleteW.restype=w.BOOL
adv.CredEnumerateW.argtypes=[w.LPCWSTR,w.DWORD,c.POINTER(w.DWORD),c.POINTER(c.c_void_p)]; adv.CredEnumerateW.restype=w.BOOL
count=w.DWORD(); ptr=c.c_void_p(); ok=adv.CredEnumerateW(None,0,c.byref(count),c.byref(ptr)); enumerr=0 if ok else c.get_last_error()
if ok: adv.CredFree(ptr)
target='Honsen-QA-probe-'+str(uuid.uuid4()); blob=(c.c_ubyte*4)(1,2,3,4); cred=CREDENTIAL(); cred.Type=1; cred.TargetName=target; cred.CredentialBlobSize=4; cred.CredentialBlob=blob; cred.Persist=2; cred.UserName='synthetic'; result=adv.CredWriteW(c.byref(cred),0); err=0 if result else c.get_last_error(); deleted=bool(adv.CredDeleteW(target,1,0)) if result else None
print(json.dumps({'enumerate_ok':bool(ok),'enumerate_error':enumerr,'credential_count':count.value,'credwrite_ok':bool(result),'credwrite_error':err,'message':c.FormatError(err).strip() if err else '', 'own_probe_deleted':deleted},indent=2))
