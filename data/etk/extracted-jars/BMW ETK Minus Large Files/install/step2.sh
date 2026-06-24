#! /bin/sh

# Batch-Aktionen, welche vom JAVA-Installer aufgerufen werden
cd #TARGETDIR#

# JAVA_HOME setzen, damit Tomcat beim Linuxsystemstart gestartet werden kann
# fuer sed im Pfad die / maskieren
java_home_for_sed=`sed 's:/:\\\/:g' <<End
$JAVA_HOME
End
`
# Variable durch Pfad ersetzen
sed 's/#JAVA_HOME#/'$java_home_for_sed'/g' BmwEtk > BmwEtk.tmp
if test -s BmwEtk.tmp
then
	mv BmwEtk.tmp BmwEtk
else
	echo !!ERROR!! JAVA_HOME could not be set in BmwEtk
fi

#Permissions setzen
# die kopierten Dateien sollen ausfuehrbar sein
chmod -R a+x *
chmod -R a+w *

if #UPDATE#
then
  cd #TARGETDIR#/transbase
  # Transbase nur bei Neuinstallation entpacken
else
  cd #TARGETDIR#/transbase
  gunzip transbase_linux.tar.gz
  tar -xf transbase_linux.tar
  rm transbase_linux.tar
fi

if test ! -d #TARGETDIR#/javaclient/jre1.5.0_11
then
  # alte JAVA Version nicht vorhanden
  cd #TARGETDIR#/javaclient
  gunzip jre_1.7.0_55.tar.gz
  tar -xf jre_1.7.0_55.tar
  rm jre_1.7.0_55.tar
else 
  # alte JAVA Version vorhanden -> löschen
  cd #TARGETDIR#/javaclient
  rm -f jre1.5.0_11
fi

if test ! -d #TARGETDIR#/javaclient/jre1.7.0_55
then
  # JAVA fuer den Client nur entpacken, wenn die Version noch nicht existiert
  cd #TARGETDIR#/javaclient
  gunzip jre_1.7.0_55.tar.gz
  tar -xf jre_1.7.0_55.tar
  rm jre_1.7.0_55.tar
fi

cd #TARGETDIR#

# Tomcat als Service einrichten
if #TOMCATSERVICE#
then
  /bin/sh #TARGETDIR#/tomcat/bin/startup.sh
fi

#bei Update
if #UPDATE#
then
 # Tomcat wieder starten, wenn er installiert war
 if #TOMCATINSTALLED#
 then
   # msg OG - 09.12.2010 - logs löschen
   rm -f #TARGETDIR#/tomcat/logs/*.log
   rm -f #TARGETDIR#/tomcat/logs/*.txt
   rm -f #TARGETDIR#/tomcat/logs/*.out
   /bin/sh #TARGETDIR#/tomcat/bin/startup.sh
 fi
 
 # Update EtkNutzer
 echo Updating EtkNutzer
 source #TARGETDIR#/transbase/rc.tbenv

 echo TRANSBASE=$TRANSBASE
 echo TRANSBASE_SERVICENAMES=$TRANSBASE_SERVICENAMES
 
 if [ $TRANSBASE = '' ]
 then
	TRANSBASE=nn
 fi
 if [ $TRANSBASE_SERVICENAMES = '' ]
 then
	TRANSBASE_SERVICENAMES=nn
 fi
 
 echo TRANSBASE=$TRANSBASE
 echo TRANSBASE_SERVICENAMES=$TRANSBASE_SERVICENAMES

 cd #TARGETDIR#/admintool
 java -jar admintool.jar NutzerdatenUnix $TRANSBASE $TRANSBASE_SERVICENAMES #OLDVERSION#

# Log des admintool fuer alle schreibbar
chmod a+w *

# nur bei Neuinstallation
else
  # Transbase als Service einrichten
  . #TARGETDIR#/transbase/rc.tbenv
  /bin/sh #TARGETDIR#/transbase/rc.TransBase

  # Datenbank und Tabellen erzeugen
  /bin/sh transbase_db.sh

  # etk_services im Boot-Verzeichnis installieren
  /bin/sh #TARGETDIR#/etk_services.sh
fi

echo "*"
echo "**************************************************************************"
echo "*"
echo "* Please click OK to continue the installation."
echo "*"
echo "**************************************************************************"
