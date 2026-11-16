import type {Priority} from "../types";
export function scorePriority(severity:string, affected:number|null, category:string, description:string){
 let score=({Low:1,Medium:2,High:4,Critical:7} as Record<string,number>)[severity]||2;
 if(affected && affected>=20)score+=3;else if(affected && affected>=5)score+=2;else if(affected && affected>=2)score+=1;
 const safety=["Electrical Issues","Water Supply"].includes(category)&&/spark|shock|fire|leak|flood|exposed/i.test(description);
 if(safety)score+=3;
 const priority:Priority=score>=7?"Critical":score>=5?"High":score>=3?"Medium":"Low";
 return {priority,reason:`Severity ${severity} contributes base score; ${affected??"unspecified"} people affected; category ${category}${safety?"; safety keywords detected":""}. Score ${score}.`};
}
export function normalize(s:string){return s.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>2)}
export function similarity(a:string,b:string){const x=new Set(normalize(a)),y=new Set(normalize(b));if(!x.size||!y.size)return 0;return [...x].filter(w=>y.has(w)).length/ new Set([...x,...y]).size;}
