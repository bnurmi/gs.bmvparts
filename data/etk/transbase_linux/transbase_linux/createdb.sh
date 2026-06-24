#! /bin/sh

$1/tbadmin -cf etk_publ p=tmp h=$1/etk_publ typ=E ps=4096 lc=1024 rs=512000 d=,512000 cp=utf8
$1/tbadmin -cf etk_nutzer p=tmp h=$1/etk_nutzer cp=utf8
$1/tbadmin -cf etk_preise p=tmp h=$1/etk_preise cp=utf8

$1/tbi -f $1/webretknutzer_tb.sql etk_nutzer tbadmin tmp
$1/tbi -f $1/webretkpreise_tb.sql etk_preise tbadmin tmp
