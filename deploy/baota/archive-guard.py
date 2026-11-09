"""Validate ZIP paths/types before invoking unzip; never follow archive links."""
import os
import posixpath
import re
import stat
import subprocess
import sys
import zipfile


def verify(path):
    with zipfile.ZipFile(path) as archive:
        seen = {}
        links = {}
        total = 0
        for entry in archive.infolist():
            name = entry.filename.rstrip('/')
            if name.startswith('./'):
                name = name[2:]
            if not name or name.startswith('/') or re.search(r'[\\\x00-\x1f:]', name) or any(x in ('', '.', '..') for x in name.split('/')) or name in seen:
                raise ValueError('UNSAFE_ARCHIVE_PATH')
            if any(x == '.env' or re.match(r'^\.env\.(?!example$)', x) or re.search(r'\.(pem|key|pfx|sqlite3?|dump|backup)$', x, re.I) for x in name.split('/')):
                raise ValueError('SECRET_FILE')
            mode = entry.external_attr >> 16
            kind = stat.S_IFMT(mode)
            if mode & 0o7000 or kind not in (0, stat.S_IFREG, stat.S_IFDIR, stat.S_IFLNK) or entry.flag_bits & 1:
                raise ValueError('UNSAFE_ARCHIVE_TYPE')
            if kind == stat.S_IFLNK:
                target = archive.read(entry).decode('utf-8')
                destination = posixpath.normpath(posixpath.join(posixpath.dirname(name), target))
                if target.startswith('/') or re.search(r'[\\\x00-\x1f:]', target) or destination == '..' or destination.startswith('../'):
                    raise ValueError('UNSAFE_ARCHIVE_LINK')
                links[name] = target
            seen[name] = kind
            total += entry.file_size
            if total > 1024 * 1024 * 1024 or len(seen) > 100000:
                raise ValueError('ARCHIVE_LIMIT')
        for name in seen:
            parent = posixpath.dirname(name)
            while parent:
                if seen.get(parent) not in (None, 0, stat.S_IFDIR):
                    raise ValueError('ARCHIVE_LINK_PARENT')
                parent = posixpath.dirname(parent)
        for name, target in links.items():
            queue = posixpath.dirname(name).split('/') + target.split('/')
            stack, visited = [], {name}
            while queue:
                part = queue.pop(0)
                if part in ('', '.'):
                    continue
                if part == '..':
                    if not stack:
                        raise ValueError('UNSAFE_ARCHIVE_LINK')
                    stack.pop()
                    continue
                candidate = '/'.join(stack + [part])
                if candidate in links:
                    if candidate in visited or len(visited) > 64:
                        raise ValueError('UNSAFE_ARCHIVE_LINK')
                    visited.add(candidate)
                    queue = links[candidate].split('/') + queue
                else:
                    stack.append(part)
        if archive.testzip() is not None:
            raise ValueError('ARCHIVE_CRC')


if __name__ == '__main__':
    try:
        verify(sys.argv[1])
        if len(sys.argv) == 3:
            destination = os.path.abspath(sys.argv[2])
            if os.path.lexists(destination) or os.path.realpath(os.path.dirname(destination)) != os.path.dirname(destination):
                raise ValueError('TARGET_EXISTS_OR_SYMLINK')
            os.mkdir(destination, 0o700)
            subprocess.run(['unzip', '-q', os.path.abspath(sys.argv[1]), '-d', destination], check=True)
        print('ARCHIVE_VERIFIED')
    except Exception as error:
        print(type(error).__name__ + ': ' + str(error), file=sys.stderr)
        sys.exit(1)
