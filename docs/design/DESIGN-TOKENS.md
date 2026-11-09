# Design Tokens

| 用途     | 值        |
| -------- | --------- |
| 品牌导航 | `#123C32` |
| 主要操作 | `#24755E` |
| 页面背景 | `#F5F7F6` |
| 正文     | `#24352F` |
| 表面     | `#FFFFFF` |
| 次要文字 | `#536B60` |
| 边框     | `#CBD8D1` |
| 轻背景   | `#EDF2EF` |

共享实现位于 `apps/desktop/src/styles/tokens.css`，由 `index.css` 引入。采用 `--honsen-*` 语义名称，页面通过变量引用，禁止为同一语义引入另一套色值。

间距使用 4、8、12、16、20、24px。正文 14px、紧凑辅助正文 13px。控件默认最小高度 32px，允许因文本换行增长。圆角控件 6px、面板 8px。焦点轮廓 2px，不能被容器裁切。

危险、警告和成功状态须提供可读文字，不能将品牌绿色当作所有状态的统一含义。新增状态色需检查对比度并加入共享令牌。金额列使用一致数字对齐，但不改变整数最小货币单位的存储规则。

令牌接入不等于全应用已符合规范；基线、组件及原生验收仍需独立记录。

## Initial token contrast measurements

Calculated from sRGB relative luminance on 2026-11-09: body #24352F on #F5F7F6 12.01:1; white on action #24755E 5.55:1; white on brand #123C32 12.22:1; secondary #536B60 on white 5.77:1. These pairs exceed 4.5:1 for normal text. This calculation does not verify every component, disabled state, focus boundary or native DPI rendering.
