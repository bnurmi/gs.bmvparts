#! /bin/sh

# das als Parameter uebergebene Verzeichnis umounten

if expr $# = 1 > /dev/null
then
	# den Namen des Verz. so basteln, dass ein Endzeichen / entfaellt
        name=`dirname $1`/`basename $1`

	# darf mount aufgerufen werden?
	mount > /dev/null
	if [ $? -eq 126 ]
	then
		# keine Berechtigung mount auszufuehren
		exit 5
	fi

	# ueberpruefe, ob das Verzeichnis ueberhaupt gemountet ist
	mount | grep $name > /dev/null
	if [ $? -eq 1 ]
	then
		# Verzeichnis ist nicht gemountet
		exit 4
	fi

	# reichen die Rechte, um die fstab einzulesen?
	if [ -r /etc/fstab ]
	then
		# ueberprufe, ob automount am Werk ist
		grep $name /etc/fstab | grep subfs > /dev/null
		if [ $? -eq 0 ]
		then
			# automount - aushaengen ist nicht notwendig
			exit 0
		fi
	else
		# fstab darf nicht gelesen werden
		echo fstab kann nicht gelesen werden
		echo evtl. fehler bei umount wg. automount
	fi


	umount $1
	ret=$?
	if [ $ret -eq 0 ]
	then
		# umount erfolgreich
		exit 0
	elif [ $ret -eq 1 ]
	then
		# umount kann nicht ausgefuehrt werden, da sich jemand im Verzeichnis befindet
		exit 1
	else
		# Fehler umount - wahrscheinlich fehlende Berechtigung
		exit 2
	fi
else
	# Skript wird falsch aufgerufen
	echo falsche Anzahl an Argumenten
	echo Aufruf: $0 Verzeichnis
	exit 3
fi
