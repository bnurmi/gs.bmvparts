#! /bin/sh
LD_LIBRARY_PATH=`dirname $0`
export LD_LIBRARY_PATH

#optionale Parameter, wenn Samba-Konfigurationsdatei nicht /etc/samba/samba.conf ist:
# -smb <Pfad und Dateiname>
if expr $# = 0 > /dev/null || expr $# = 2 > /dev/null
then
 java -classpath "`dirname $0`/install/install.jar:`dirname $0`/javaclient/libs/log4j.jar" webetk.install.server.InstallServer `dirname $0` `echo $1` `echo $2`;
else
  echo falsche Anzahl an Argumenten
  echo Aufruf: install_server.sh
  echo oder install_server.sh -smb Sambakonfigurationsdatei
fi
