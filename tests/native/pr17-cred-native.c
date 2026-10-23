#include <windows.h>
#include <wincred.h>
#include <objbase.h>
#include <stdio.h>
#include <wchar.h>

int main(void) {
    GUID id;
    wchar_t guid[40], target[80];
    unsigned char blob[64] = {0};
    if (CoCreateGuid(&id) != S_OK || !StringFromGUID2(&id, guid, 40)) return 1;
    for (int n = 0; n < 2; n++) {
        CREDENTIALW cred = {0};
        PCREDENTIALW existing = NULL;
        if (n == 0) swprintf(target, 80, L"Q%.7ls", guid + 1);
        else swprintf(target, 80, L"%.36ls.V-%.8ls", guid + 1, guid + 1);
        if (CredReadW(target, CRED_TYPE_GENERIC, 0, &existing)) {
            CredFree(existing);
            return 2;
        }
        if (GetLastError() != ERROR_NOT_FOUND) return 3;
        cred.Type = CRED_TYPE_GENERIC;
        cred.TargetName = target;
        cred.CredentialBlobSize = n ? 64 : 1;
        cred.CredentialBlob = blob;
        cred.Persist = CRED_PERSIST_ENTERPRISE;
        cred.UserName = L"synthetic";
        SetLastError(0);
        BOOL ok = CredWriteW(&cred, 0);
        DWORD err = ok ? 0 : GetLastError();
        BOOL deleted = ok ? CredDeleteW(target, CRED_TYPE_GENERIC, 0) : FALSE;
        DWORD delete_error = ok && !deleted ? GetLastError() : 0;
        BOOL present = deleted ? CredReadW(target, CRED_TYPE_GENERIC, 0, &existing) : FALSE;
        DWORD read_error = deleted && !present ? GetLastError() : 0;
        if (present) CredFree(existing);
        wprintf(L"case=%d target_if_created=%ls target_length=%zu type=1 blob_size=%lu persist=3 username=synthetic credential_flags=0 api_flags=0 return=%d error=%lu deleted=%d delete_error=%lu present_after_delete=%d read_error=%lu bits=%zu\n", n, ok ? target : L"none", wcslen(target), cred.CredentialBlobSize, ok, err, deleted, delete_error, present, read_error, sizeof(void *) * 8);
        if (ok && (!deleted || present || read_error != ERROR_NOT_FOUND)) return 4;
    }
    return 0;
}
