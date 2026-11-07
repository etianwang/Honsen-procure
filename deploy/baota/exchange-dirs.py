"""Linux atomic exchange only. No PM2, database restore, removal or restart."""
import ctypes
import os
import sys


def exchange(live, stage):
    live, stage = os.path.abspath(live), os.path.abspath(stage)
    if live == stage or os.path.dirname(live) != os.path.dirname(stage):
        raise ValueError('SIBLING_DIRECTORIES_REQUIRED')
    for path in (live, stage):
        if os.path.islink(path) or os.path.realpath(path) != path or not os.path.isdir(path):
            raise ValueError('REAL_DIRECTORIES_REQUIRED')
    if os.stat(live).st_dev != os.stat(stage).st_dev:
        raise ValueError('SAME_FILESYSTEM_REQUIRED')
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = libc.renameat2
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    if renameat2(-100, os.fsencode(live), -100, os.fsencode(stage), 2) != 0:
        raise OSError(ctypes.get_errno(), 'ATOMIC_EXCHANGE_FAILED_NO_FALLBACK')


if __name__ == '__main__':
    if len(sys.argv) != 4 or sys.argv[3] != '--verified-stopped-backed-up-and-migrated':
        sys.exit('Use only after verify-target, stopped-process check, verified backup and migration; see README')
    exchange(sys.argv[1], sys.argv[2])
    print('DIRECTORIES_EXCHANGED_OLD_TREE_RETAINED_DO_NOT_AUTO_START_OLD_API')
