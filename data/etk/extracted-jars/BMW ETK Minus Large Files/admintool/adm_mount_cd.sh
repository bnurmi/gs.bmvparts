#! /bin/sh

# das als Parameter uebergebene Verzeichnis mounten

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

	# reichen die Rechte, um die fstab einzulesen
	if [ -r /etc/fstab ]
	then
		# ueberprufe, ob automount am Werk ist
		grep $name /etc/fstab | grep subfs > /dev/null
		if [ $? -eq 0 ]
		then
			# automount - einhaengen ist nicht notwendig
			exit 0
		fi
	else
		# fstab darf nicht gelesen werden
		echo fstab kann nicht gelesen werden
		echo evtl. fehler bei mount wg. automount
	fi

	mount $1
	ret=$?
	if [ $ret -eq 0 ]
	then
		# mount erfolgreich
		exit 0
	elif [ $ret -eq 32 ]
	then
		# das Verzeichnis ist schon gemountet
		exit 4
	else
		# Fehler mount
		exit 2
	fi
else
	# Skript wird falsch aufgerufen
	echo falsche Anzahl an Argumenten
	echo Aufruf: $0 Verzeichnis
	exit 3
fi
