#! /bin/sh

# Batch-Aktionen, welche vom JAVA-Installer aufgerufen werden
cd #TARGETDIR#

source #TARGETDIR#/transbase/rc.tbenv

if #UPDATE#
then
  # RR Abfrage
  cd #TARGETDIR#/migration
  java -jar migration.jar Update

  # Firmenverzeichnisse
  cd #TARGETDIR#/admintool  
  java -jar admintool.jar UpdateAllFirmen
  
# nur bei Neuinstallation
else
  # Migration
  cd #TARGETDIR#/migration
  java -jar migration.jar

  # Firmenverwaltung
  cd #TARGETDIR#/admintool
  java -jar admintool.jar Firma
fi

# ROM-File einspielen
cd #TARGETDIR#/admintool
java -jar admintool.jar Publikationsdaten

if #UPDATE#
then :
# nur bei Neuinstallation
else
  # Migration (Anteile nach ROM-File einspielen)
  cd #TARGETDIR#/migration
  java -jar migration.jar Anpassung
fi