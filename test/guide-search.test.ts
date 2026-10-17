import assert from 'node:assert/strict';
import test from 'node:test';
import { searchGuides, type GuideSearchEntry } from '../src/guide-search.js';
import { searchTextFromMarkdown } from '../src/search-text.js';
const entries: GuideSearchEntry[] = [
  {title:'支付准备', description:'订阅指南', text:'本文解释 Codex 充值与银行卡拒付的处理方式。',url:'/guide/payments',kind:'getting-started'},
  {title:'Codex 充值方法',description:'购买说明',text:'使用应用商店付款。',url:'/articles/codex',kind:'article'},
];
test('全文搜索支持正文命中、中文、多个关键词与标题优先', () => {
  assert.equal(searchGuides(entries,'银行卡')[0]?.entry.url,'/guide/payments');
  assert.deepEqual(searchGuides(entries,'ｃｏｄｅｘ 充值').map(x=>x.entry.url),['/articles/codex','/guide/payments']);
  assert.equal(searchGuides(entries,'Codex 银行卡').length,1);
  assert.equal(searchGuides(entries,'不存在').length,0);
  assert.equal(searchGuides(entries,' ').length,0);
});
test('正文索引保留可读文字，去除属性、HTML 和 Markdown 语法', () => {
  const text = searchTextFromMarkdown('## 套餐\n\n[价格说明](https://example.com/hidden-url)\n\n**银行卡** & 充值\n\n> 下一步');
  assert.match(text,/套餐 价格说明 银行卡 & 充值 下一步/);
  assert.doesNotMatch(text,/hidden-url|<h2>|##|\*\*/);
});
