import ctypes as c
import ctypes.wintypes as w
import json
import os
import struct
import uuid
from collections import Counter

adv = c.WinDLL('Advapi32', use_last_error=True)
class FILETIME(c.Structure):
    _fields_ = [('low', w.DWORD), ('high', w.DWORD)]
class CREDENTIAL(c.Structure):
    _fields_ = [('Flags', w.DWORD), ('Type', w.DWORD), ('TargetName', w.LPWSTR), ('Comment', w.LPWSTR), ('LastWritten', FILETIME), ('CredentialBlobSize', w.DWORD), ('CredentialBlob', c.POINTER(c.c_ubyte)), ('Persist', w.DWORD), ('AttributeCount', w.DWORD), ('Attributes', c.c_void_p), ('TargetAlias', w.LPWSTR), ('UserName', w.LPWSTR)]
adv.CredWriteW.argtypes = [c.POINTER(CREDENTIAL), w.DWORD]
adv.CredWriteW.restype = w.BOOL
adv.CredReadW.argtypes = [w.LPCWSTR, w.DWORD, w.DWORD, c.POINTER(c.c_void_p)]
adv.CredReadW.restype = w.BOOL
adv.CredDeleteW.argtypes = [w.LPCWSTR, w.DWORD, w.DWORD]
adv.CredDeleteW.restype = w.BOOL
adv.CredEnumerateW.argtypes = [w.LPCWSTR, w.DWORD, c.POINTER(w.DWORD), c.POINTER(c.POINTER(c.POINTER(CREDENTIAL)))]
adv.CredEnumerateW.restype = w.BOOL
adv.CredFree.argtypes = [c.c_void_p]

count = w.DWORD()
entries = c.POINTER(c.POINTER(CREDENTIAL))()
ok = adv.CredEnumerateW(None, 0, c.byref(count), c.byref(entries))
enum_error = 0 if ok else c.get_last_error()
distribution = Counter()
if ok:
    for i in range(count.value):
        item = entries[i].contents
        distribution[(item.Type, item.Persist, item.CredentialBlobSize)] += 1
    adv.CredFree(entries)

cases = [('short', 1, 1), ('short_local', 2, 1), ('short_enterprise', 3, 1), ('short_blob64', 3, 64), ('short_blob512', 3, 512), ('short_uuid_user', 3, 1), ('length16', 3, 1), ('length24', 3, 1), ('length32', 3, 1), ('long_session', 1, 1), ('local', 2, 1), ('enterprise', 3, 1), ('local64', 2, 64), ('enterprise512', 3, 512), ('honsen_shape', 3, 64)]
results = []
for label, persist, size in cases:
    # Random names avoid changing an existing entry; an explicit read handles collision.
    target = ('Q' + uuid.uuid4().hex[:7]) if label.startswith('short') else 'Honsen-QA-' + uuid.uuid4().hex
    if label.startswith('length'):
        target = 'Q' + uuid.uuid4().hex[:int(label[6:]) - 1]
    if label == 'honsen_shape':
        target = str(uuid.uuid4()) + '.V-' + uuid.uuid4().hex[:8]
    ptr = c.c_void_p()
    present = adv.CredReadW(target, 1, 0, c.byref(ptr))
    read_error = 0 if present else c.get_last_error()
    if present:
        adv.CredFree(ptr)
    if present or read_error != 1168:
        results.append({'case': label, 'skipped': 'collision or read error', 'read_error': read_error})
        continue
    blob = (c.c_ubyte * size).from_buffer_copy(os.urandom(size))
    username = str(uuid.uuid4()) if label in ('honsen_shape', 'short_uuid_user') else 'synthetic'
    credential = CREDENTIAL()
    credential.Type = 1
    credential.TargetName = target
    credential.CredentialBlobSize = size
    credential.CredentialBlob = blob
    credential.Persist = persist
    credential.UserName = username
    result = adv.CredWriteW(c.byref(credential), 0)
    error = 0 if result else c.get_last_error()
    deleted = bool(adv.CredDeleteW(target, 1, 0)) if result else None
    delete_error = c.get_last_error() if result and not deleted else 0
    after = c.c_void_p()
    still_present = bool(adv.CredReadW(target, 1, 0, c.byref(after))) if deleted else None
    after_error = c.get_last_error() if deleted and not still_present else 0
    if still_present:
        adv.CredFree(after)
    results.append({'case': label, 'synthetic_target_if_created': target if result else None, 'type': 1, 'target_length': len(target), 'blob_size': size, 'persist': persist, 'username': username if label not in ('honsen_shape', 'short_uuid_user') else 'synthetic UUID', 'credential_flags': 0, 'api_flags': 0, 'api_return': bool(result), 'last_error': error, 'deleted_own_entry': deleted, 'delete_error': delete_error, 'read_after_delete_present': still_present, 'read_after_delete_error': after_error})
print(json.dumps({'pid': os.getpid(), 'process_bits': struct.calcsize('P') * 8, 'integrity': 'see companion whoami output', 'enumerate_ok': bool(ok), 'enumerate_error': enum_error, 'credential_count': count.value, 'distribution': [{'type': k[0], 'persist': k[1], 'blob_size': k[2], 'count': v} for k, v in sorted(distribution.items())], 'results': results}, indent=2))
