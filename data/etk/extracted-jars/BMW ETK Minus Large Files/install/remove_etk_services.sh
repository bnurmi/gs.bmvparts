#!/bin/sh
# BmwEtk zum Start der ETK-Dienste aus den jeweiligen Boot-Verzeichissen entfernen

rm /etc/rc.d/BmwEtk
rm /etc/rc.d/rc2.d/S98BmwEtk
rm /etc/rc.d/rc2.d/K01BmwEtk
rm /etc/rc.d/rc3.d/S98BmwEtk
rm /etc/rc.d/rc3.d/K01BmwEtk
rm /etc/rc.d/rc5.d/S98BmwEtk
rm /etc/rc.d/rc5.d/K01BmwEtk
