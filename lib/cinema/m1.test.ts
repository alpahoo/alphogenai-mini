import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CinemaSelectionError, selectedRunsForMontage, type CinemaScene, type CinemaShot, type CinemaTake } from "./m1";
const scenes: CinemaScene[] = [{id:"s2",project_id:"p",position:1},{id:"s1",project_id:"p",position:0}];
const shots: CinemaShot[] = [
  {id:"plan3",scene_id:"s2",project_id:"p",position:0,selected_take_id:"t3"},
  {id:"plan2",scene_id:"s1",project_id:"p",position:1,selected_take_id:"t2"},
  {id:"plan1",scene_id:"s1",project_id:"p",position:0,selected_take_id:"t1"},
];
const takes: CinemaTake[]=[{id:"t1",shot_id:"plan1",run_id:"cd598314"},{id:"t2",shot_id:"plan2",run_id:"a1bc89fe"},{id:"alt",shot_id:"plan2",run_id:"731316da"},{id:"t3",shot_id:"plan3",run_id:"e3d7a11c"}];
const completed=new Set(takes.map(t=>t.run_id));
describe("Cinema M1 selected takes",()=>{
 it("orders by scene then shot, not by creation time",()=>{
  expect(selectedRunsForMontage(scenes,shots,takes,completed)).toEqual(["cd598314","a1bc89fe","e3d7a11c"]);
 });
 it("switches only plan 2 and restores it",()=>{
  const alternative=shots.map(s=>s.id==="plan2"?{...s,selected_take_id:"alt"}:s);
  expect(selectedRunsForMontage(scenes,alternative,takes,completed)).toEqual(["cd598314","731316da","e3d7a11c"]);
  expect(selectedRunsForMontage(scenes,shots,takes,completed)[1]).toBe("a1bc89fe");
 });
 it("refuses a take of another shot or an unfinished run",()=>{
  expect(()=>selectedRunsForMontage(scenes,[...shots.slice(0,1),{...shots[1],selected_take_id:"t1"},shots[2]],takes,completed)).toThrow(CinemaSelectionError);
  expect(()=>selectedRunsForMontage(scenes,shots,takes,new Set(["cd598314","e3d7a11c"]))).toThrow(/Plan 2/);
 });
 it("never silently exports fewer clips",()=>{
  expect(()=>selectedRunsForMontage(scenes,[shots[0]],takes,completed)).toThrow(/between 2 and 10/);
 });
});
describe("prepared migration review gates",()=>{
 const sql=readFileSync("supabase/migrations/20261122_cinema_m1.sql","utf8");
 it("creates five owner-scoped tables with explicit RLS and GRANTs",()=>{
  for(const name of ["projects","scenes","elements","shots","takes"]){
   expect(sql).toContain("create table public.cinema_"+name);
   expect(sql).toContain("alter table public.cinema_"+name+" enable row level security");
   expect(sql).toContain("create policy cinema_"+name+"_own");
  }
  expect(sql).toMatch(/grant select,insert,update,delete/);
  expect(sql).toMatch(/revoke all[\s\S]+authenticated/);
  expect(sql).toContain("foreign key(id,selected_take_id)");
 });
});
