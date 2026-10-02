export const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
export const parseDay = value => new Date(`${value}T12:00:00Z`);
export const addDays = (value,n) => { const d=parseDay(value); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
export const dayDiff = (a,b) => Math.round((parseDay(b)-parseDay(a))/86400000);
export const prettyDate = (value,options={month:'short',day:'numeric'}) => parseDay(value).toLocaleDateString(undefined,{...options,timeZone:'UTC'});
export const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v||'') && !Number.isNaN(parseDay(v).getTime()) && parseDay(v).toISOString().slice(0,10)===v;
export function validateGoal(g,now=today()) {
  if (!g.title?.trim()) return 'Give your goal a clear name.';
  if (!g.success?.trim()) return 'Describe a measurable result so you know when you have finished.';
  if (!isDate(g.startDate)||!isDate(g.endDate)) return 'Choose a valid start date and deadline.';
  if (g.startDate<now) return 'Choose today or a future start date.';
  if (g.endDate<g.startDate) return 'Your deadline must be on or after your start date.';
  if (dayDiff(g.startDate,g.endDate)>365) return 'Keep this plan within one year so the next steps stay practical.';
  if (!Number.isInteger(g.dailyMinutes)||g.dailyMinutes<10||g.dailyMinutes>240) return 'Choose a daily budget between 10 and 240 minutes.';
  if (!Array.isArray(g.days)||!g.days.length) return 'Choose at least one day you can work on your goal.';
  return null;
}
const outlines = {
  build: [
    ['Define a small first version','A clear scope and success checklist',['Write the problem, audience, and smallest useful version','List the essential features and define what finished looks like','Sketch the main user journey on paper']],
    ['Build the core workflow','A working version of the essential flow',['Set up the project and build the first essential feature','Connect the remaining steps in the main user journey','Try the workflow from start to finish and note gaps']],
    ['Test and improve','A tested version ready for feedback',['Ask one person to try the main workflow','Fix the most important issue from their feedback','Check the experience on a phone and a laptop']],
    ['Launch and learn','A usable release and a record of what you learned',['Prepare a short walkthrough and launch checklist','Share the working version with your intended audience','Measure your success criteria and record the next improvement']]
  ],
  career: [
    ['Choose your focus','A clear audience and one useful service',['Choose one customer type and a problem you can solve','Write a simple description of your service and its outcome','Find five relevant people or businesses to learn from']],
    ['Create proof','One example that shows your skills',['Outline a small sample project for your chosen audience','Build the most useful part of the sample project','Write a short case study with screenshots and an explanation']],
    ['Start conversations','Specific conversations with potential clients',['Research three prospects and write one relevant note for each','Send three thoughtful introductions through your chosen channel','Follow up on replies and note the questions people ask']],
    ['Review and refine','A clearer service and an actionable next step',['Review the conversations and identify the strongest interest','Improve your service description using what you learned','Check the goal outcome and plan the next set of conversations']]
  ],
  learn: [
    ['Set a learning target','A focused practice plan',['Choose one skill and a small project that demonstrates it','Check your starting knowledge and identify the biggest gap','Choose one learning resource and schedule practice']],
    ['Practice the fundamentals','Small exercises you can explain',['Study the first essential concept and take five notes','Solve a small exercise without following the example','Review your mistakes and repeat the difficult part']],
    ['Apply the skill','A small independent project',['Outline your demonstration project and its requirements','Build the first complete version using what you learned','Test the project and explain your choices in writing']],
    ['Review and demonstrate','Evidence of progress and the next learning target',['Ask someone to review your project or compare it to your criteria','Improve the weakest part and document the result','Assess your success measure and choose what to practice next']]
  ],
  wellbeing: [
    ['Make the routine realistic','A small habit and a starting baseline',['Record your starting point using your chosen measure','Choose a small routine that fits your available time','Prepare your environment and remove one practical obstacle']],
    ['Build consistency','A routine you can repeat',['Complete one easy practice session and record how it felt','Repeat the routine and note what made starting easier','Adjust the routine to fit your energy and schedule']],
    ['Review what works','A sustainable version of your routine',['Compare your recent sessions with your starting point','Repeat the version of the routine that worked best','Make a simple backup routine for busy days']],
    ['Keep what matters','A progress review and a continuation plan',['Check your success measure and record the change','Identify the habit you want to keep after this goal','Write a realistic plan for maintaining the routine']]
  ],
  custom: [
    ['Define the outcome','Clear evidence of what finished looks like',['Write your success criteria and current starting point','List the resources and constraints that affect the goal','Choose the first small step that creates visible progress']],
    ['Make a first attempt','A tangible first result',['Work on the smallest useful part of your goal','Complete a first version or practice attempt','Compare your attempt with your success criteria']],
    ['Improve the result','A stronger version based on feedback',['Find the biggest gap between your result and your target','Take one specific action to close that gap','Ask for feedback or check your progress independently']],
    ['Finish and reflect','A final result and a record of the lessons',['Complete the remaining essential work','Measure the result against your success criteria','Record what worked and the next step you want to take']]
  ]
};
export function suggestCheckpoints(category,title,success) {
  const list=outlines[category]||outlines.custom;
  return list.map(([name,deliverable,actions],i)=>({id:uid(),title:name,deliverable,actions:[...actions.slice(0,2),i===3?`Check the result: ${success}`:actions[2]].join('\n')}));
}
export function workDates(g) {
  const result=[];
  for(let d=g.startDate; d<=g.endDate; d=addDays(d,1)) if(g.days.includes(parseDay(d).getUTCDay())) result.push(d);
  return result;
}
export function generatePlan(g,checkpoints,actionMinutes) {
  const dates=workDates(g);
  if(!dates.length) throw new Error('There are no available workdays before your deadline. Change your days or extend the deadline.');
  if(!Number.isInteger(actionMinutes)||actionMinutes<5||actionMinutes>g.dailyMinutes) throw new Error('Each action needs at least 5 minutes and must fit your daily time budget.');
  if(!checkpoints.length) throw new Error('Add at least one checkpoint.');
  const stages=checkpoints.map(c=>({...c,title:c.title.trim(),deliverable:c.deliverable.trim(),actionList:c.actions.split('\n').map(t=>t.trim()).filter(Boolean)}));
  if(stages.some(c=>!c.title||!c.actionList.length)) throw new Error('Each checkpoint needs a name and at least one concrete action.');
  const count=stages.reduce((n,c)=>n+c.actionList.length,0);
  if(count>160) throw new Error('Keep the outline to 160 actions or fewer. You can add actions as you go.');
  const slots=dates.flatMap(date=>Array.from({length:Math.floor(g.dailyMinutes/actionMinutes)},()=>date));
  if(count>slots.length) throw new Error(`${count} actions need ${count*actionMinutes} minutes. Your chosen days can fit ${slots.length} actions. Reduce the outline, shorten actions, or extend the deadline.`);
  const tasks=[];
  let k=0;
  const milestones=stages.map(c=>{
    const milestoneId=uid();
    for(const title of c.actionList) {
      const slot=count===1?0:Math.floor(k*(slots.length-1)/(count-1));
      tasks.push({id:uid(),title,date:slots[slot],minutes:actionMinutes,milestoneId,done:false,completedOn:null}); k++;
    }
    return {id:milestoneId,title:c.title,deliverable:c.deliverable,date:tasks.at(-1).date};
  });
  return {milestones,tasks};
}
export function periods(goal,type,now=today()) {
  if(type==='end') return [{key:`end:${goal.startDate}:${goal.endDate}`,start:goal.startDate,end:goal.endDate,due:goal.endDate<=now,label:'End of goal'}];
  const list=[];
  for(let start=goal.startDate;start<=goal.endDate;) {
    let end;
    if(type==='weekly') end=addDays(start,6);
    else {
      const d=parseDay(start); d.setUTCMonth(d.getUTCMonth()+1,0); end=d.toISOString().slice(0,10);
    }
    if(end>goal.endDate) end=goal.endDate;
    list.push({key:`${type}:${start}:${end}`,start,end,due:end<=now,label:`${prettyDate(start)} – ${prettyDate(end)}`});
    start=addDays(end,1);
  }
  return list;
}
export function currentPeriod(goal,type,now=today()) {
  const list=periods(goal,type,now);
  return list.find(p=>p.start<=now&&p.end>=now)|| (now<goal.startDate?list[0]:list.at(-1));
}
export function streak(tasks,now=today()) {
  const dates=new Set(tasks.filter(t=>t.done&&t.completedOn).map(t=>t.completedOn));
  let cursor=dates.has(now)?now:addDays(now,-1), result=0;
  while(dates.has(cursor)){result++;cursor=addDays(cursor,-1);}
  return result;
}
export function createDemo(now=today()) {
  const goal={id:uid(),title:'Launch my first AI automation service',success:'One working demo, a clear service page, and 10 relevant client conversations.',why:'Build something useful, grow my skills, and take the first step toward working independently.',category:'career',startDate:now,endDate:addDays(now,27),dailyMinutes:45,days:[1,2,3,4,5,6,0]};
  const milestones=[['Find my focus','One audience. One useful problem.'],['Build something useful','A small demo that proves the idea.'],['Start conversations','Ten thoughtful conversations.'],['Learn and refine','A clearer service and a next step.']].map(([title,deliverable],i)=>({id:uid(),title,deliverable,date:addDays(now,(i+1)*7-1)}));
  const rows=[['Choose one audience and write down their biggest repeated task',0,20,0],['Describe the result my automation will deliver in one sentence',0,15,0],['Find three examples of this problem in real businesses',2,30,0],['Sketch the input, steps, and output of the automation',7,30,1],['Build a small demo with one complete workflow',9,45,1],['Test the demo using three realistic examples',12,30,1],['Create a short walkthrough of the demo',14,30,2],['Research five relevant prospects',16,30,2],['Start ten relevant client conversations',19,45,2],['Review the feedback and common questions',21,30,3],['Improve the service description and demo',24,30,3],['Measure my results and write the next step',27,30,3]];
  return {version:1,mode:'demo',goal,milestones,tasks:rows.map(([title,offset,minutes,index])=>({id:uid(),title,date:addDays(now,offset),minutes,milestoneId:milestones[index].id,done:false,completedOn:null})),reflections:[],archives:[],createdAt:new Date().toISOString()};
}
export function validateImport(s) {
  if(!s||s.version!==1||!['personal','demo'].includes(s.mode)||!s.goal||!Array.isArray(s.tasks)||!Array.isArray(s.milestones)||!Array.isArray(s.reflections)||!Array.isArray(s.archives)) return false;
  const g=s.goal;
  if(typeof g.id!=='string'||typeof g.title!=='string'||typeof g.success!=='string'||typeof g.why!=='string'||!isDate(g.startDate)||!isDate(g.endDate)||g.startDate>g.endDate||dayDiff(g.startDate,g.endDate)>365||!Number.isInteger(g.dailyMinutes)||g.dailyMinutes<10||g.dailyMinutes>240||!Array.isArray(g.days)||!g.days.length||g.days.some(d=>!Number.isInteger(d)||d<0||d>6)) return false;
  if(s.tasks.length>1000||s.reflections.length>1000||s.archives.length>50||s.milestones.length>30) return false;
  if(!s.milestones.every(m=>typeof m.id==='string'&&typeof m.title==='string'&&typeof m.deliverable==='string'&&isDate(m.date))) return false;
  if(!s.tasks.every(t=>typeof t.id==='string'&&typeof t.title==='string'&&isDate(t.date)&&t.date>=g.startDate&&t.date<=g.endDate&&Number.isInteger(t.minutes)&&t.minutes>0&&t.minutes<=240&&typeof t.done==='boolean'&&(t.completedOn===null||isDate(t.completedOn))&&s.milestones.some(m=>m.id===t.milestoneId))) return false;
  if(new Set(s.tasks.map(t=>t.id)).size!==s.tasks.length||new Set(s.milestones.map(m=>m.id)).size!==s.milestones.length) return false;
  if(!s.reflections.every(r=>typeof r.id==='string'&&['weekly','monthly','end'].includes(r.type)&&typeof r.periodKey==='string'&&isDate(r.start)&&isDate(r.end)&&typeof r.wins==='string'&&typeof r.challenges==='string'&&typeof r.lesson==='string'&&typeof r.next==='string'&&typeof r.createdAt==='string'&&Number.isInteger(r.mood)&&r.mood>=1&&r.mood<=5)) return false;
  return s.archives.every(a=>validateImport({...a,archives:[]}));
}
