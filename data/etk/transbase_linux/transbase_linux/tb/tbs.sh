if [ -f makeper ]; then
chmod 600 makeper 
fi
chmod 644 tberror.h 
chmod 644 tbfid.h 
chmod 644 mig33t41 
chmod 700 tbfsmrep 
chmod 700 tbcheck 
chmod 711 tbcheckx
chmod 711 tbdiff
chmod 711 tbstatis
chmod 700 mkapf
$TRANSBASE/mkapf f.id
chmod 600 f.id
$TRANSBASE/mkapf password.ini
chmod 600 password.ini
cat <<FIN >rc.TransBase


#
# TransBase daemons boot script 
# 
# Note that all "echo" commands are in parentheses. This is done 
# because all commands that redirect the output to /dev/console 
# must be done in a child of the main shell, so that the main shell 
# does not open a terminal and get its process group set.  Since 
# "echo" is a builtin command, redirection for it will be done 
# in the main shell unless the command is run in a subshell. 
# 

TRANSBASE=$TRANSBASE
export TRANSBASE 
. $TRANSBASE/rc.tbenv
. $TRANSBASE/rc.tbjre
cd \$TRANSBASE
	FLAG=-bfnv
(echo "running rc.TransBase on \`date\`" >>nohup.out)
if [ -w /dev/console ]; then 
	CONS=/dev/console
else 
	CONS=/dev/tty
fi 
SERV=\$TRANSBASE/tbserver
if [ -f \$TRANSBASE/mykernel ]; then 
	PROG=\$TRANSBASE/mykernel
elif [ -f \$TRANSBASE/tbkernel ]; then 
	PROG=\$TRANSBASE/tbkernel
elif [ -f \$TRANSBASE/tbdiag ]; then 
	PROG=\$TRANSBASE/tbdiag
else
	PROG=\$TRANSBASE/mydiag
fi 
if [ -f \$TRANSBASE/myadmin ]; then 
	ADM=\$TRANSBASE/myadmin
else
	ADM=\$TRANSBASE/tbadmin
fi 
(echo "booting TransBase databases ..." >\$CONS)
\$ADM \$FLAG >>nohup.out
sleep 1 
(echo "starting TransBase daemons ..." >\$CONS)
if [ -f \$TRANSBASE/tbmux ]; then 
	(nohup \$TRANSBASE/tbmux -tbk \$PROG -tbs \$SERV )&
else 
	(nohup \$SERV -v )&
	(nohup \$PROG -v )&
fi 
sleep 1 
exit 0 
FIN
chmod 700 rc.TransBase
chmod 755 dat; chmod ugo+r dat/*
chmod 755 optree; chmod ugo+r optree/*
$TRANSBASE/mkapf dblist.ini
chmod 600 dblist.ini
chmod 755 scripts; chmod ugo+r scripts/*
chmod 755 migra; chmod ugo+r migra/*
chmod 700 tbstop 
cat <<FIN >rc.tbstop


#
# TransBase daemons shutdown script 
# 
# Note that all "echo" commands are in parentheses. This is done 
# because all commands that redirect the output to /dev/console 
# must be done in a child of the main shell, so that the main shell 
# does not open a terminal and get its process group set.  Since 
# "echo" is a builtin command, redirection for it will be done 
# in the main shell unless the command is run in a subshell. 
# 

if [ \$# -eq 0 ]; then
	FLAG=-snv
else
	FLAG=\$1nv
fi
TRANSBASE=$TRANSBASE
export TRANSBASE 
. $TRANSBASE/rc.tbenv
cd \$TRANSBASE
(echo "running rc.tbstop on \`date\`" >>nohup.out)
if [ -w /dev/console ]; then 
	CONS=/dev/console
else 
	CONS=/dev/tty
fi 
(echo "shutting down TransBase databases ..." >\$CONS)
if [ -f \$TRANSBASE/myadmin ]; then 
	ADM=\$TRANSBASE/myadmin
else
	ADM=\$TRANSBASE/tbadmin
fi 
\$ADM \$FLAG >>nohup.out
if [ \$? -ne 0 ]; then exit \$?; fi 
sleep 1 
if [ -f \$TRANSBASE/tbstop ]; then 
	(echo "stopping TransBase daemons ..." >\$CONS)
	\$TRANSBASE/tbstop >>nohup.out
fi 
exit 0 
FIN
chmod 700 rc.tbstop
/bin/rm -f rc.tbenv
cat <<FIN >rc.tbenv
#!/bin/sh
#
# TransBase Environment Setting
# 
# 
. $TRANSBASE/.profile

FIN
chmod 755 rc.tbenv
/bin/rm -f .profile
cat <<FIN >.profile
#!/bin/sh
#
# TransBase Environment Setting
# 
# 

TRANSBASE=$TRANSBASE
export TRANSBASE 
TRANSBASE_SERVICENAMES=$TRANSBASE_SERVICENAMES
export TRANSBASE_SERVICENAMES

FIN
chmod 755 .profile
/bin/rm -f .cshrc
cat <<FIN >.cshrc
#!/bin/csh


#
# TransBase Environment Setting
# 
# 

setenv TRANSBASE $TRANSBASE
setenv TRANSBASE_SERVICENAMES $TRANSBASE_SERVICENAMES

FIN
chmod 755 .cshrc

chmod 700 rc.tbjre
if [ -f $TRANSBASE/tbdiag ]; then 
chmod +t tbdiag  
chmod 700 tbdiag
fi 
chmod +t tbkernel  
chmod 700 tbkernel
chmod +t tbserver  
chmod 700 tbserver
chmod 711 tbi
chmod 644 tbadmmsg 
chmod 644 tbadmsdk.h 
chown root tbadmin 2>/dev/null
chmod 711 tbadmin; chmod ug+s tbadmin 
chmod 755 util; chmod ugo+r util/*
if [ ! -d log ]; then
    mkdir log
fi
chmod 700 log
chmod 700 tbrecord 
chmod 700 tbmux 
chmod 711 tbarc
chmod 711 tbtar
chmod 711 tbtape
chmod u+rx tbdr 
chmod 700 diskrec 
chmod 644 tbjre/lib/tbjdbc.jar 
