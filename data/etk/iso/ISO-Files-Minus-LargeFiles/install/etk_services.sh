#!/bin/sh

# in das Verzeichnis wechseln, in dem unser Shellscript liegt
cd `dirname $0`

# BmwEtk zum Start der ETK-Dienste in die jeweiligen Boot-Verzeichisse kopieren
cp BmwEtk /etc/rc.d/BmwEtk

#Bei den jeweiligen Runleveln Links anlegen
cd /etc/rc.d/rc2.d
ln -s ../BmwEtk S98BmwEtk
ln -s ../BmwEtk K01BmwEtk
cd /etc/rc.d/rc3.d
ln -s ../BmwEtk S98BmwEtk
ln -s ../BmwEtk K01BmwEtk
cd /etc/rc.d/rc5.d
ln -s ../BmwEtk S98BmwEtk
ln -s ../BmwEtk K01BmwEtk
