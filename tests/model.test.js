import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays,dayDiff,validateGoal,generatePlan,suggestCheckpoints,periods,streak,validateImport,createDemo,isDate} from '../dist/planner.js';
const goal={title:'Launch a demo',success:'Three people can complete the workflow',why:'Build something useful',category:'build',startDate:'2026-10-02',endDate:'2026-10-29',dailyMinutes:30,days:[1,2,3,4,5]};
test('A plan respects workdays, deadline, checkpoint order, and daily capacity',()=>{
 const p=generatePlan(goal,suggestCheckpoints('build',goal.title,goal.success),30);
 assert.equal(p.tasks.length,12);
 const totals={};
 for(const t of p.tasks){assert.ok(t.date>=goal.startDate&&t.date<=goal.endDate);assert.ok(goal.days.includes(new Date(t.date+'T12:00:00Z').getUTCDay()));totals[t.date]=(totals[t.date]||0)+t.minutes;}
 assert.ok(Object.values(totals).every(n=>n<=goal.dailyMinutes));
 assert.ok(p.tasks.every((t,i)=>i===0||t.date>=p.tasks[i-1].date));
 for(const m of p.milestones)assert.equal(m.date,p.tasks.filter(t=>t.milestoneId===m.id).at(-1).date);
 assert.ok(p.tasks.at(-1).title.includes(goal.success));
});
test('Impossible and empty schedules produce actionable errors',()=>{
 const small={...goal,endDate:goal.startDate};
 assert.throws(()=>generatePlan(small,suggestCheckpoints('build','x','y'),30),/can fit 1 action/);
 assert.throws(()=>generatePlan({...small,days:[0]},[{title:'One',deliverable:'',actions:'Do one thing'}],30),/no available workdays/);
 assert.throws(()=>generatePlan(goal,[{title:'',deliverable:'',actions:'Do one thing'}],30),/name and at least one/);
 assert.throws(()=>generatePlan(goal,[{title:'One',deliverable:'',actions:'Do one thing'}],40),/daily time budget/);
});
test('A one-day custom goal and multi-action workdays are supported',()=>{
 const one={...goal,startDate:'2026-10-02',endDate:'2026-10-02',dailyMinutes:60};
 const p=generatePlan(one,[{title:'Deliver',deliverable:'A result',actions:'Test the flow\nRecord the result'}],30);
 assert.deepEqual(p.tasks.map(t=>t.date),['2026-10-02','2026-10-02']);
});
test('Date validation catches reversed, past, malformed, and excessive deadlines',()=>{
 assert.equal(validateGoal(goal,'2026-10-02'),null);
 assert.match(validateGoal({...goal,endDate:'2026-10-01'},'2026-10-02'),/deadline/);
 assert.match(validateGoal({...goal,startDate:'2026-10-01'},'2026-10-02'),/future/);
 assert.match(validateGoal({...goal,endDate:'2028-10-01'},'2026-10-02'),/one year/);
 assert.match(validateGoal({...goal,days:[]},'2026-10-02'),/at least one/);
 assert.equal(isDate('2026-02-30'),false);
 assert.equal(dayDiff('2026-12-31','2027-01-01'),1);
 assert.equal(addDays('2028-02-28',1),'2028-02-29');
});
test('Weekly and calendar-month reflections cover each day exactly once',()=>{
 const g={...goal,startDate:'2028-01-30',endDate:'2028-03-03'};
 for(const type of ['weekly','monthly']){const p=periods(g,type,'2028-02-15');assert.equal(p[0].start,g.startDate);assert.equal(p.at(-1).end,g.endDate);for(let i=1;i<p.length;i++)assert.equal(p[i].start,addDays(p[i-1].end,1));}
 assert.deepEqual(periods(g,'monthly').map(p=>p.end),['2028-01-31','2028-02-29','2028-03-03']);
 assert.equal(periods(g,'end','2028-03-03')[0].due,true);
 assert.equal(periods(g,'end','2028-03-02')[0].due,false);
});
test('Streak comes from actual completion dates, including a rest day today',()=>{
 const tasks=['2026-10-01','2026-09-30','2026-09-29'].map(completedOn=>({done:true,completedOn}));
 assert.equal(streak(tasks,'2026-10-02'),3);
 assert.equal(streak(tasks,'2026-10-03'),0);
 tasks.push({done:true,completedOn:'2026-10-02'});
 assert.equal(streak(tasks,'2026-10-02'),4);
});
test('Backup validation rejects corruption and accepts archived personal goals',()=>{
 const s=createDemo('2026-10-02');assert.equal(validateImport(s),true);
 assert.equal(validateImport({...s,tasks:[{...s.tasks[0],date:'broken'}]}),false);
 assert.equal(validateImport({...s,tasks:[{...s.tasks[0],date:'2027-01-01'}]}),false);
 assert.equal(validateImport({...s,reflections:[{wins:'hello'}]}),false);
 assert.equal(validateImport({...s,tasks:[s.tasks[0],s.tasks[0]]}),false);
 const {archives,...old}=s;old.mode='personal';assert.equal(validateImport({...s,archives:[old]}),true);
});
