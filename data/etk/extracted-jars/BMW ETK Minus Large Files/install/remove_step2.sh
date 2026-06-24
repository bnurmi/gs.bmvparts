#! /bin/sh

# entfernt beim Deinstall die Services und dier Firmenverzeichnisse

cd #TARGETDIR#/admintool

java -classpath "../javaclient/libs/log4j.jar:.:admintool.jar:tbjdbc.jar" webetk.admintool.framework.MainViewController DeleteAllFirmen

cd #TARGETDIR#

if [ #TOMCATSERVICE# ]
then
  ./tomcat/bin/shutdown.sh
fi

/bin/sh ./remove_step2b.sh

# etk_services aus Boot-Verzeichnis entfernen
/bin/sh #TARGETDIR#/remove_etk_services.sh

echo "*"
echo "**************************************************************************"
echo "*"
echo "* Please click OK to contuinue the deinstaller."
echo "*"
echo "**************************************************************************"
