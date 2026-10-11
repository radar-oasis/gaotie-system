import { buildMotifAnalysisPrompt, buildMotifGenerationPrompt } from './motif-transformation-rules';

it('makes carrier adaptation explicit without globally freezing proportions', () => {
  const prompt = buildMotifAnalysisPrompt('适合高铁涂装');
  expect(prompt).toContain('主体本身的宽高比');
  expect(prompt).toContain('抬升、回落、舒展、收束');
  expect(prompt).toContain('保留项不得包含本轮要改变的属性');
  expect(prompt).not.toContain('以适度转化为默认');
});

it('allows related changes in detail edits instead of freezing the whole composition', () => {
  const prompt = buildMotifGenerationPrompt('detail', '拉长', '拉长躯干');
  expect(prompt).toContain('必要的关联调整');
  expect(prompt).not.toContain('不进行整体重构');
  expect(prompt).not.toContain('车身适配策略');
});

it('reinforces livery adaptation in the final generation instruction', () => {
  const prompt = buildMotifGenerationPrompt('livery', '适合高铁', '优化');
  expect(prompt).toContain('横向比例');
  expect(prompt).toContain('曲线起伏');
  expect(prompt).not.toContain('适度整理');
});
