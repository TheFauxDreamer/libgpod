# WARNING! THIS HAS NOT BEEN TESTED!!

I still haven't recieved my iPod yet, so I can't actually test this tool.

I only intend to official support the iPod Classic Video (5th gen), others should work but I won't be implementing fixes for issues on other devices.
Feel free to fork it yourself or submit and request with the fixes.

# WebPod - macOS Native Build

Manage your iPod's music library through a mac app.

## About

This is a horendously janky Claude fueled attempt at making a native apple silicon version of the web based tool in the main branch.
The native build is meant to be a feature comparable version to the original web version.

- Mapping the music works
- Albums view works
- Songs view works
- Viewing the contents of an album works (iTunes 11 my beloved)
- I doubt anything else works...

### About libgpod

libgpod is a library for reading and writing the iTunes database on iPods. It supports:
- All "classic" iPod models, iPod Nano, iPod Mini
- iPhone and iPod Touch (partial - requires iTunes-initialized database)
- Cover art and photos
- Playlists and track metadata

I have applied bug fixes, and made minor modifications to the original libgpod. No additions to the 16 year old tool have been made.

### Documentation

- [README.overview](README.overview) - Architecture overview
- [README.SysInfo](README.SysInfo) - Device information
- [README.sqlite](README.sqlite) - SQLite database format

---

## License

libgpod is licensed under the LGPL. See COPYING for details.

## Credits

Originally part of [gtkpod](http://www.gtkpod.org). WebPod interface added for modern web-based iPod management.
