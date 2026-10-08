import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalStage, pipelineOf, stageLabel, DEFAULT_SECTIONS, formatCr, openDealValue } from '../src/pipeline.js';

test('all existing contacts remain visible in their confirmed section', () => {
  const migrated = [['New',134,'E'],['Qualified',34,'E'],['Not qualified',48,'E'],['Contacted',1,'S'],["Didn't pick up",23,'S'],['Negotiation',9,'D'],['Lost',2,'D']];
  const totals = {E:0,S:0,O:0,V:0,D:0};
  for (const [stage,count,section] of migrated) {
    assert.equal(pipelineOf(stage), section);
    totals[section] += count;
  }
  assert.deepEqual(totals, {E:216,S:24,O:0,V:0,D:11});
  assert.equal(stageLabel('New'), 'New / awaiting qualification');
});

test('legacy worker statuses resolve to configured stages', () => {
  for (const [old,next] of [['Not Qualified','Not qualified'],['Attempted',"Didn't pick up"],['Visit Scheduled','Visit scheduled'],['Booked','Deal closed']]) {
    assert.equal(canonicalStage(old), next);
    assert.ok(Object.values(DEFAULT_SECTIONS).flat().includes(next));
  }
  assert.equal(pipelineOf('Visit Scheduled'), 'V');
});

test('custom stage placement follows the saved section', () => {
  const sections = {...DEFAULT_SECTIONS, O:[...DEFAULT_SECTIONS.O,'Shortlist review']};
  assert.equal(pipelineOf('Shortlist review', sections),'O');
});

test('deal totals retain integer zeros and exclude terminal stages', () => {
  for (const [amount,label] of [[10,'₹10 Cr'],[20,'₹20 Cr'],[100,'₹100 Cr'],[1.5,'₹1.5 Cr'],[0,'—']]) assert.equal(formatCr(amount),label);
  assert.equal(openDealValue([{lead_status:'Negotiation',deal_value_cr:10},{lead_status:'Lost',deal_value_cr:20},{lead_status:'Deal closed',deal_value_cr:30}]),10);
});
