
;
; before starting tbtar or tbarc
;
update systable set ttype = 'V' where tname = 'sysconstraint';
drop view sysconstraint;
create view sysconstraint
    (segno,constraintname,attributes, constrainttext,cpos) as
	select 
	segno, constraintname, attributes, 
	constrainttext, cpos from "@@sysconstraint";
update systable set ttype = 'v' where tname = 'sysconstraint';

ct

