# 分支与工作树封存

初始主仓库注册 47 个工作树，16 个有脏内容；其中一个登记失效，保留不 prune。空 stash；缺失文件/未解决冲突没有被 reset、clean 或补写。额外浅层扫描未找到遗漏的 Procure clone；新建恢复 clone 独立于原工作树。Toolbox 的单独仓库不混入本应用 Git。

所有新封存均为 UNVERIFIED WIP，不是功能验收。通过临时 Git index/hash-object/commit-tree 封存，原工作树、原 branch、原暂存区均保持原样；未提交的删除只记录，不把成批源码删除传播到备份树。原 bytes、binary staged/unstaged patch、index stages 与合并状态另在交接归档中。冲突树 wip-10 含冲突标记，恢复时先查原三阶段 index；wip-41 是未提交合并快照，不能当已验收 RC。无应用逻辑在本任务中被修改。

## 远端已核验的封存分支

每项 source SHA 是原提交，archive SHA 是实际推送的恢复提交；两者不得混称。已有未推送干净分支使用内容不变的归档提交，标记 [skip ci]，避免为封存重复启动旧应用 QA；不用于绕过任何 PR/release gate。

| 类型 / 原分支                                           | 原 SHA                                   | 远端封存分支                                   | 远端 SHA                                 | 保存文件数 |
| ------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------- | ---------------------------------------- | ---------- |
| WIP / codex/qa-fix2-g2-preparation                      | 25a56af0aef635be7e1ab0a878784c53a87fac49 | codex/handover-20261025/wip-00                 | 978e38face28e1acfb5f2de654622fb01eb72836 | 4          |
| WIP / codex/v1-business-flow                            | a2b73ae9ee348fb6540b64a797b3274a9cb71450 | codex/handover-20261025/wip-01                 | d36d02887be13917c5a4f0a5e94c55227f98b779 | 1          |
| WIP / codex/g4-bounded-close                            | 02f7cc0ab84de175e0861c978ab02d9659db09b0 | codex/handover-20261025/wip-04                 | bdd026e105e80d0809d864e1ae1a5966c3fd5cd3 | 3          |
| WIP / codex/rc-stabilization-toolbox-preflight-20261025 | 7ef0284272f3857977a79ec7c24c70ffdc530d91 | codex/handover-20261025/wip-08                 | a1f069a5ca598e427b269a478a9dacb8e59f3e31 | 4          |
| WIP / codex/t08-t10-desktop-integration                 | 0a42ebead9797250261297c35a9378507cc8c7f6 | codex/handover-20261025/wip-10                 | c9d1961a10010ca6756d7ad3545f2cab77e77671 | 4          |
| WIP / codex/rc-login-context-display                    | 0fd4a99674496ead51ac7e12186c31dbcd2d57e8 | codex/handover-20261025/wip-12                 | ec075dbbaecb3ba6f2c1f00ac9b7214208d0cd0e | 1          |
| WIP / detached 35                                       | f805c9ed3c88f6af16238e999539fd591f7d93b4 | codex/handover-20261025/wip-35                 | fb7560c21465ee9a522b828db723b264f81393de | 10         |
| WIP / codex/v1-rc-20261024                              | f9145e1e4f62958e379f8f81c08971a9383c116b | codex/handover-20261025/wip-41                 | 7ef21037be6d3c11076578cc8ba38c7f4c4058d3 | 240        |
| WIP / codex/qa-t10d-g4-b190a82                          | 1ec046fc8bebbb89e4c48164c61a3237300405fb | codex/handover-20261025/wip-45                 | 7a79b0f5e5f6abc36901bdd28f898db8503c5b8e | 3          |
| LOCAL_BRANCH / codex/procure-logo                       | 564cb1e4b0b96d312f1164f71ec1499dc0f9f809 | codex/handover-20261025/procure-logo           | d303821a4109a9c39811b4a14988f571561b15ad | 0          |
| LOCAL_BRANCH / codex/procurement-mode-cards             | 45fd5eff6e625f873ef5ce3bac9d392f70ddaaa4 | codex/handover-20261025/procurement-mode-cards | bc44402dd37064847a4e079db3c9c908c803f9f0 | 0          |
| LOCAL_BRANCH / codex/v1-demo-recovery                   | baed1098a4dda993845617ee40b67047e063143a | codex/handover-20261025/v1-demo-recovery       | cfb1cf71f225035f8d12f2cc0f8784d5a76cee8f | 0          |
| LOCAL_BRANCH / codex/v1-demo-screenshots                | 17174f0f70ef95e39cd33fdc682785975d427f43 | codex/handover-20261025/v1-demo-screenshots    | ea0c999af253c363626c3f3564a928e965f10536 | 0          |

## 原工作树逐项状态

下面为 freeze 初始清单。后续其他已获用户授权的总控创建的 handover-control/B/C 分支另见最终补充清单；不能把初始状态当最终实时状态。

| ID  | 原路径                                                                         | 原分支                                            | 原 HEAD                                  | 初始脏项 / 封存                               |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| 00  | E:/Project/Honsen materials                                                    | codex/qa-fix2-g2-preparation                      | 25a56af0aef635be7e1ab0a878784c53a87fac49 | 111; 4 files sealed; 1 local-only excluded    |
| 01  | C:/Users/This PC/.codex/worktrees/business-flow-v1/Honsen materials            | codex/v1-business-flow                            | a2b73ae9ee348fb6540b64a797b3274a9cb71450 | 1; 1 files sealed; 0 local-only excluded      |
| 02  | C:/Users/This PC/.codex/worktrees/fixer-api-postgres-qa-a82050d                | (detached / unavailable)                          | 717a8e09cce37b37758e461c7bf9299f18b2885d | 0; 0 files sealed; 0 local-only excluded      |
| 03  | C:/Users/This PC/.codex/worktrees/fixer-t10-lifecycle-74365f0                  | (detached / unavailable)                          | 8e20a481b85429dcc9974a33591216fa3fde13a2 | 0; 0 files sealed; 0 local-only excluded      |
| 04  | C:/Users/This PC/.codex/worktrees/g4-bounded-close/Honsen materials            | codex/g4-bounded-close                            | 02f7cc0ab84de175e0861c978ab02d9659db09b0 | 4; 3 files sealed; 1061 local-only excluded   |
| 05  | C:/Users/This PC/.codex/worktrees/pr17-sync-p1-repair/Honsen materials         | (detached / unavailable)                          | d0d6e858e4d3a53129c6ac9291bc66f646ab68da | 0; 0 files sealed; 0 local-only excluded      |
| 06  | C:/Users/This PC/.codex/worktrees/procure-logo/Honsen materials                | codex/procure-logo                                | 564cb1e4b0b96d312f1164f71ec1499dc0f9f809 | 0; 0 files sealed; 0 local-only excluded      |
| 07  | C:/Users/This PC/.codex/worktrees/procurement-t09a/Honsen materials            | codex/procurement-t09a                            | a869a526d58aa05817d888ab0500708f7354f36a | 0; 0 files sealed; 0 local-only excluded      |
| 08  | C:/Users/This PC/.codex/worktrees/release-toolbox/Honsen materials             | codex/rc-stabilization-toolbox-preflight-20261025 | 7ef0284272f3857977a79ec7c24c70ffdc530d91 | 4; 4 files sealed; 0 local-only excluded      |
| 09  | C:/Users/This PC/.codex/worktrees/t04-fix1-final-qa/Honsen materials           | (detached / unavailable)                          | (invalid gitdir)                         | 0; 0 files sealed; 0 local-only excluded      |
| 10  | C:/Users/This PC/.codex/worktrees/t08-t10-desktop-integration/Honsen materials | codex/t08-t10-desktop-integration                 | 0a42ebead9797250261297c35a9378507cc8c7f6 | 4; 4 files sealed; 0 local-only excluded      |
| 11  | C:/Users/This PC/.codex/worktrees/v1-demo-screenshots/Honsen materials         | codex/v1-demo-recovery                            | baed1098a4dda993845617ee40b67047e063143a | 0; 0 files sealed; 0 local-only excluded      |
| 12  | C:/Users/This PC/.codex/worktrees/v1-rc-control/Honsen materials               | codex/rc-login-context-display                    | 0fd4a99674496ead51ac7e12186c31dbcd2d57e8 | 1; 1 files sealed; 0 local-only excluded      |
| 13  | C:/Users/This PC/.codex/worktrees/v1-release/Honsen materials                  | codex/v1-release                                  | d3485144b075dceb8082e493c94791aab699a3af | 0; 0 files sealed; 0 local-only excluded      |
| 14  | C:/Users/This PC/.codex/worktrees/v1-release-candidate/Honsen materials        | codex/v1-release-candidate                        | 700387baefec934b7fc370caece53d7445960496 | 0; 0 files sealed; 0 local-only excluded      |
| 15  | E:/Honsen-PR17-Final-Review                                                    | codex/qa-pr17-reference-final                     | 0e5b0af30979d033ae2472abeff0471511b19bf4 | 0; 0 files sealed; 0 local-only excluded      |
| 16  | E:/Honsen-PR17-Sync-P1                                                         | codex/pr17-sync-p1-repair                         | 2b95a47653958754d5b278cb4d02be023bf846c4 | 0; 0 files sealed; 0 local-only excluded      |
| 17  | E:/Project/honsen-catalog-quote-pagination                                     | codex/catalog-quote-pagination                    | c00129745572ab8e80d8ef42aca1cba79aefc37e | 0; 0 files sealed; 0 local-only excluded      |
| 18  | E:/Project/honsen-g1-fix2-independent-recheck                                  | codex/qa-g1-fix2-recheck                          | 13b22ffe8aa294535f9036eda32d7cfc81f6481f | 184; 0 files sealed; 1815 local-only excluded |
| 19  | E:/Project/honsen-g1-integration                                               | codex/g1-session-invalidation                     | 85d0565a5b695a94da7bd5aa861178bfcbc77a52 | 1; 0 files sealed; 2552 local-only excluded   |
| 20  | E:/Project/honsen-g1-qa-independent-85d0565                                    | codex/g1-qa001-fix2                               | 13b22ffe8aa294535f9036eda32d7cfc81f6481f | 1; 0 files sealed; 3311 local-only excluded   |
| 21  | E:/Project/honsen-g3-integration                                               | codex/integrate-g3-qa-9e6c                        | c3eca9b57e4a9b6d4438cb548d3fdf4b01bcbc45 | 0; 0 files sealed; 0 local-only excluded      |
| 22  | E:/Project/honsen-linux-deploy-final-qa                                        | codex/qa-v1-linux-deployment-final                | 5b17e253742aea41dd41255b92de3696b461d4b0 | 0; 0 files sealed; 0 local-only excluded      |
| 23  | E:/Project/honsen-linux-deploy-gate                                            | codex/v1-linux-deployment-gate                    | 1e71f13f5068742950ef6efbb94a918d727e251e | 0; 0 files sealed; 0 local-only excluded      |
| 24  | E:/Project/honsen-p1-qa-514747d                                                | (detached / unavailable)                          | 514747dfd4239aefd092e59341c3539e40c40b6a | 0; 0 files sealed; 0 local-only excluded      |
| 25  | E:/Project/honsen-p1-qa-exec-514747d                                           | (detached / unavailable)                          | 514747dfd4239aefd092e59341c3539e40c40b6a | 2; 0 files sealed; 2 local-only excluded      |
| 26  | E:/Project/honsen-p1-qa-run-514747d                                            | (detached / unavailable)                          | 514747dfd4239aefd092e59341c3539e40c40b6a | 2; 0 files sealed; 2 local-only excluded      |
| 27  | E:/Project/honsen-pr15-integration-evidence                                    | codex/pr15-integration-evidence                   | 37dc2ef68f5494e746c5bb25f4ec98d50a345677 | 0; 0 files sealed; 0 local-only excluded      |
| 28  | E:/Project/honsen-pr15-integration-review                                      | codex/pr15-integration-fix                        | ef6b360638fe42639ef95edec7e4a586b7b6c443 | 0; 0 files sealed; 0 local-only excluded      |
| 29  | E:/Project/honsen-pr15-review                                                  | (detached / unavailable)                          | dc414f18b5efba040ce4a20bacefb3d1a4de539c | 0; 0 files sealed; 0 local-only excluded      |
| 30  | E:/Project/honsen-pr16-final-review                                            | codex/pr16-final-review                           | 258994771bb874393c67e30c6dfc569889c41f41 | 0; 0 files sealed; 0 local-only excluded      |
| 31  | E:/Project/honsen-pr17-country-fix                                             | codex/pr17-country-isolation-fix                  | 20da0985fdb18b1e4a6571c54de8a0a4af40282c | 0; 0 files sealed; 0 local-only excluded      |
| 32  | E:/Project/honsen-pr17-recheck-target                                          | (detached / unavailable)                          | 20da0985fdb18b1e4a6571c54de8a0a4af40282c | 0; 0 files sealed; 0 local-only excluded      |
| 33  | E:/Project/honsen-pr17-supplier-qa                                             | codex/qa-pr17-supplier-maintenance                | bbdca41bf8aaa08753b233b2fa12a9ef3188b831 | 0; 0 files sealed; 0 local-only excluded      |
| 34  | E:/Project/honsen-pr18-final-review                                            | codex/pr18-final-review                           | 581490845aa58a1be76de96fa02666ce1720ec75 | 0; 0 files sealed; 0 local-only excluded      |
| 35  | E:/Project/honsen-pr18-linux-test                                              | (detached / unavailable)                          | f805c9ed3c88f6af16238e999539fd591f7d93b4 | 10; 10 files sealed; 0 local-only excluded    |
| 36  | E:/Project/honsen-pr18-owner-issue-qa                                          | (detached / unavailable)                          | c00129745572ab8e80d8ef42aca1cba79aefc37e | 0; 0 files sealed; 0 local-only excluded      |
| 37  | E:/Project/honsen-pr18-quote-qa                                                | codex/qa-pr18-quote-pagination                    | 4e3fe01e2b3dff948bd0c4cd68cb38a5115c1daa | 1; 0 files sealed; 9987 local-only excluded   |
| 38  | E:/Project/honsen-pr18-recheck-pg                                              | (detached / unavailable)                          | 0f9895ae4df12abdccda57246c13eccebb66e000 | 0; 0 files sealed; 0 local-only excluded      |
| 39  | E:/Project/honsen-pr18-stale-quote-evidence                                    | codex/pr18-stale-quote-evidence                   | c88e5c211bf90069f446bb9335c8b67c91160cb1 | 0; 0 files sealed; 0 local-only excluded      |
| 40  | E:/Project/honsen-procurement-mode-cards                                       | codex/procurement-mode-cards                      | 45fd5eff6e625f873ef5ce3bac9d392f70ddaaa4 | 1; 0 files sealed; 1257 local-only excluded   |
| 41  | E:/Project/honsen-rc-integration                                               | codex/v1-rc-20261024                              | f9145e1e4f62958e379f8f81c08971a9383c116b | 240; 240 files sealed; 0 local-only excluded  |
| 42  | E:/Project/honsen-t04-fix2-final-qa                                            | codex/qa-t04-fix2-final                           | 9742e9ce071994f794f48357032f7ac574afd37d | 0; 0 files sealed; 0 local-only excluded      |
| 43  | E:/Project/honsen-t10-bd-independent-qa                                        | codex/qa-t10-bd-independent-35b9f60               | 9e6c6457de755a2afc3c81dda0391dc1664da67b | 0; 0 files sealed; 0 local-only excluded      |
| 44  | E:/Project/honsen-t10d-g4                                                      | codex/t10d-g4-order-conflicts                     | b190a82cf528fcd654b268abba3de6f139b42dee | 0; 0 files sealed; 0 local-only excluded      |
| 45  | E:/Project/honsen-t10d-g4-qa                                                   | codex/qa-t10d-g4-b190a82                          | 1ec046fc8bebbb89e4c48164c61a3237300405fb | 4; 3 files sealed; 4513 local-only excluded   |
| 46  | E:/Project/honsen-v1-materials-gap                                             | codex/v1-materials-gap                            | d0d6e858e4d3a53129c6ac9291bc66f646ab68da | 0; 0 files sealed; 0 local-only excluded      |

## 全部本地分支与同名远端

同名远端为 — 时，不代表代码未备份：只读检查表明除上面四个本地分支外，其余本地 HEAD 已可从 origin 分支历史获取；按本表 SHA 可重建本地分支。恢复不要机械将本地旧指针覆盖到较新远端。

| 本地分支                                          | 本地 SHA                                 | 同名远端 SHA                             |
| ------------------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| codex/admin-master-data-closeout                  | 6286a37b6d4fea55844eb04ba7e3bde8e2ffcc79 | 6286a37b6d4fea55844eb04ba7e3bde8e2ffcc79 |
| codex/bethel-desktop-e2e                          | 88b645e5b6f76ecb2a00902f44b3424e3fa65d8c | 88b645e5b6f76ecb2a00902f44b3424e3fa65d8c |
| codex/catalog-quote-pagination                    | c00129745572ab8e80d8ef42aca1cba79aefc37e | c00129745572ab8e80d8ef42aca1cba79aefc37e |
| codex/ci-trigger-policy                           | 41cbd6eb603832bc7ff1c24012aa3e391574bb63 | 41cbd6eb603832bc7ff1c24012aa3e391574bb63 |
| codex/codex-command-policy                        | 45971b8580322c31d95de14998aaab32fe7d5496 | 45971b8580322c31d95de14998aaab32fe7d5496 |
| codex/fixer-api-postgres-qa                       | fbf5a8d4cf58c02efda197629731110b369d0515 | fbf5a8d4cf58c02efda197629731110b369d0515 |
| codex/g1-conflict-origin                          | fbdb14b6afac217688de6cb138514d1bd593cdc8 | —                                        |
| codex/g1-independent-final-qa                     | b0a6069e1439203fd9259b8cc3e619ac6eb70c2c | —                                        |
| codex/g1-qa001-fix2                               | 13b22ffe8aa294535f9036eda32d7cfc81f6481f | —                                        |
| codex/g1-security-recheck                         | bfa6752ccd64a6b39c36bdab96e1cb4c611ada5d | —                                        |
| codex/g1-session-invalidation                     | 85d0565a5b695a94da7bd5aa861178bfcbc77a52 | —                                        |
| codex/g4-bounded-close                            | 02f7cc0ab84de175e0861c978ab02d9659db09b0 | —                                        |
| codex/git-workflow-policy-handoff                 | d898c3b095eaa1e23f14abf768c3dd50942bf56a | d898c3b095eaa1e23f14abf768c3dd50942bf56a |
| codex/handover-20261025/procure-logo              | d303821a4109a9c39811b4a14988f571561b15ad | d303821a4109a9c39811b4a14988f571561b15ad |
| codex/handover-20261025/procurement-mode-cards    | bc44402dd37064847a4e079db3c9c908c803f9f0 | bc44402dd37064847a4e079db3c9c908c803f9f0 |
| codex/handover-20261025/v1-demo-recovery          | cfb1cf71f225035f8d12f2cc0f8784d5a76cee8f | cfb1cf71f225035f8d12f2cc0f8784d5a76cee8f |
| codex/handover-20261025/v1-demo-screenshots       | ea0c999af253c363626c3f3564a928e965f10536 | ea0c999af253c363626c3f3564a928e965f10536 |
| codex/handover-20261025/wip-00                    | 978e38face28e1acfb5f2de654622fb01eb72836 | 978e38face28e1acfb5f2de654622fb01eb72836 |
| codex/handover-20261025/wip-01                    | d36d02887be13917c5a4f0a5e94c55227f98b779 | d36d02887be13917c5a4f0a5e94c55227f98b779 |
| codex/handover-20261025/wip-04                    | bdd026e105e80d0809d864e1ae1a5966c3fd5cd3 | bdd026e105e80d0809d864e1ae1a5966c3fd5cd3 |
| codex/handover-20261025/wip-08                    | a1f069a5ca598e427b269a478a9dacb8e59f3e31 | a1f069a5ca598e427b269a478a9dacb8e59f3e31 |
| codex/handover-20261025/wip-10                    | c9d1961a10010ca6756d7ad3545f2cab77e77671 | c9d1961a10010ca6756d7ad3545f2cab77e77671 |
| codex/handover-20261025/wip-12                    | ec075dbbaecb3ba6f2c1f00ac9b7214208d0cd0e | ec075dbbaecb3ba6f2c1f00ac9b7214208d0cd0e |
| codex/handover-20261025/wip-35                    | fb7560c21465ee9a522b828db723b264f81393de | fb7560c21465ee9a522b828db723b264f81393de |
| codex/handover-20261025/wip-41                    | 7ef21037be6d3c11076578cc8ba38c7f4c4058d3 | 7ef21037be6d3c11076578cc8ba38c7f4c4058d3 |
| codex/handover-20261025/wip-45                    | 7a79b0f5e5f6abc36901bdd28f898db8503c5b8e | 7a79b0f5e5f6abc36901bdd28f898db8503c5b8e |
| codex/handover-business-20261025                  | 220cd83d265b182b477866fe26447e166c7ae121 | 220cd83d265b182b477866fe26447e166c7ae121 |
| codex/handover-control-20261025                   | 0fd4a99674496ead51ac7e12186c31dbcd2d57e8 | —                                        |
| codex/handover-release-20261025                   | e527327d56c1fdc6922dbb0d6650aa39dbe1b1cf | e527327d56c1fdc6922dbb0d6650aa39dbe1b1cf |
| codex/integrate-accepted-fix2-g2                  | 7b2d29cc61f7f67eb366d01de61c98f3bccf2995 | —                                        |
| codex/integrate-g3-qa-9e6c                        | c3eca9b57e4a9b6d4438cb548d3fdf4b01bcbc45 | —                                        |
| codex/multi-agent-workflow                        | 2a000c15425dc6232b595c7bdcc827378c7819f5 | 2a000c15425dc6232b595c7bdcc827378c7819f5 |
| codex/p1-sync-event-origin                        | 514747dfd4239aefd092e59341c3539e40c40b6a | —                                        |
| codex/parent-acceptance-coordination              | 70bd54d13ff13afa8ef5fe2dbabad27c23457f9b | 70bd54d13ff13afa8ef5fe2dbabad27c23457f9b |
| codex/parent-acceptance-qa                        | 194d303487d41731fcf8d43a887f1400dfb4065c | 194d303487d41731fcf8d43a887f1400dfb4065c |
| codex/pr-auth-1                                   | 70295df0096696ab0fc68cd7cf022da7bc56a869 | 70295df0096696ab0fc68cd7cf022da7bc56a869 |
| codex/pr-expense-durable                          | 570656690ca67fb83dd7b85e5ab8e635d2806383 | 570656690ca67fb83dd7b85e5ab8e635d2806383 |
| codex/pr-market-receiving                         | 77aa047fb439d386ee2ccd7d0134db5959b13378 | 77aa047fb439d386ee2ccd7d0134db5959b13378 |
| codex/pr-requisition-history                      | 2dc5e64b9200948a72873c19a3faf88f7214779f | 2dc5e64b9200948a72873c19a3faf88f7214779f |
| codex/pr-supplier-scope                           | 4796358f69f4382a625283e7f446ab1e330bbf23 | 4796358f69f4382a625283e7f446ab1e330bbf23 |
| codex/pr15-integration-evidence                   | 37dc2ef68f5494e746c5bb25f4ec98d50a345677 | 37dc2ef68f5494e746c5bb25f4ec98d50a345677 |
| codex/pr15-integration-fix                        | ef6b360638fe42639ef95edec7e4a586b7b6c443 | —                                        |
| codex/pr16-final-review                           | 258994771bb874393c67e30c6dfc569889c41f41 | 258994771bb874393c67e30c6dfc569889c41f41 |
| codex/pr17-country-isolation-fix                  | 20da0985fdb18b1e4a6571c54de8a0a4af40282c | 20da0985fdb18b1e4a6571c54de8a0a4af40282c |
| codex/pr17-sync-p1-repair                         | 2b95a47653958754d5b278cb4d02be023bf846c4 | 2b95a47653958754d5b278cb4d02be023bf846c4 |
| codex/pr18-final-review                           | 581490845aa58a1be76de96fa02666ce1720ec75 | 581490845aa58a1be76de96fa02666ce1720ec75 |
| codex/pr18-stale-quote-evidence                   | c88e5c211bf90069f446bb9335c8b67c91160cb1 | c88e5c211bf90069f446bb9335c8b67c91160cb1 |
| codex/procure-logo                                | 564cb1e4b0b96d312f1164f71ec1499dc0f9f809 | —                                        |
| codex/procurement-mode-cards                      | 45fd5eff6e625f873ef5ce3bac9d392f70ddaaa4 | —                                        |
| codex/procurement-t09a                            | a869a526d58aa05817d888ab0500708f7354f36a | a869a526d58aa05817d888ab0500708f7354f36a |
| codex/qa-b203c70-server                           | ed9505953f803f8abc859ab402bbc30f896d8035 | —                                        |
| codex/qa-fix2-g2-preparation                      | 25a56af0aef635be7e1ab0a878784c53a87fac49 | —                                        |
| codex/qa-g1-fix2-recheck                          | 13b22ffe8aa294535f9036eda32d7cfc81f6481f | —                                        |
| codex/qa-g2-formal-pull                           | ff7bff6f421cb71448deff017bba7a8f0485070a | —                                        |
| codex/qa-native008-recheck                        | 3c76f43245bc88511e4ea45e0e29964ec74ccd01 | 3c76f43245bc88511e4ea45e0e29964ec74ccd01 |
| codex/qa-pr17-final-integration                   | 94126b50cc0f92faa1fc145c847ad1978046d227 | 94126b50cc0f92faa1fc145c847ad1978046d227 |
| codex/qa-pr17-p1-final                            | 4d486cdf840961c7480a1c603d7dee104fc0af22 | 4d486cdf840961c7480a1c603d7dee104fc0af22 |
| codex/qa-pr17-reference-final                     | 0e5b0af30979d033ae2472abeff0471511b19bf4 | 0e5b0af30979d033ae2472abeff0471511b19bf4 |
| codex/qa-pr17-supplier-maintenance                | bbdca41bf8aaa08753b233b2fa12a9ef3188b831 | bbdca41bf8aaa08753b233b2fa12a9ef3188b831 |
| codex/qa-pr18-quote-pagination                    | 4e3fe01e2b3dff948bd0c4cd68cb38a5115c1daa | 4e3fe01e2b3dff948bd0c4cd68cb38a5115c1daa |
| codex/qa-t04-fix1-final                           | e70f77b29ecfa797fdb537964575f37d53768386 | e70f77b29ecfa797fdb537964575f37d53768386 |
| codex/qa-t04-fix2-final                           | 9742e9ce071994f794f48357032f7ac574afd37d | 9742e9ce071994f794f48357032f7ac574afd37d |
| codex/qa-t04-material-category                    | 6f2fc889691d3620f9efd073cbe502385be46a03 | 6f2fc889691d3620f9efd073cbe502385be46a03 |
| codex/qa-t10-bd-independent-35b9f60               | 9e6c6457de755a2afc3c81dda0391dc1664da67b | —                                        |
| codex/qa-t10d-g4-b190a82                          | 1ec046fc8bebbb89e4c48164c61a3237300405fb | 1ec046fc8bebbb89e4c48164c61a3237300405fb |
| codex/qa-v1-linux-deployment-final                | 5b17e253742aea41dd41255b92de3696b461d4b0 | 5b17e253742aea41dd41255b92de3696b461d4b0 |
| codex/rc-login-context-display                    | 0fd4a99674496ead51ac7e12186c31dbcd2d57e8 | 0fd4a99674496ead51ac7e12186c31dbcd2d57e8 |
| codex/rc-stabilization-toolbox-preflight-20261025 | 7ef0284272f3857977a79ec7c24c70ffdc530d91 | 7ef0284272f3857977a79ec7c24c70ffdc530d91 |
| codex/release-ci-format                           | f9145e1e4f62958e379f8f81c08971a9383c116b | —                                        |
| codex/release-template-cos-default-20261025       | e23de5b447e91ac26e6368e3d32098608882abc8 | e23de5b447e91ac26e6368e3d32098608882abc8 |
| codex/release-toolbox                             | e23de5b447e91ac26e6368e3d32098608882abc8 | f9145e1e4f62958e379f8f81c08971a9383c116b |
| codex/t01-t10-feature-audit                       | 83bc413f293bcf8b2b38f6680dacb82a0db0b11b | 83bc413f293bcf8b2b38f6680dacb82a0db0b11b |
| codex/t04-material-category-maintenance           | dc414f18b5efba040ce4a20bacefb3d1a4de539c | ef6b360638fe42639ef95edec7e4a586b7b6c443 |
| codex/t04-parent-acceptance                       | 7b408decaba33a66b606771a68679b71ed1eeea4 | 7b408decaba33a66b606771a68679b71ed1eeea4 |
| codex/t04-unit-management                         | 74365f0f39032d4b768d8bc4c397b626221820f1 | —                                        |
| codex/t04a-blocker-handoff                        | d67856853b35bbca01fb7c9672201542dac2a361 | d67856853b35bbca01fb7c9672201542dac2a361 |
| codex/t08-formal-execution                        | 6a006edc05ac6d7d826e99711caddbe964ad3054 | —                                        |
| codex/t08-formal-server-sync                      | e37902fd8e057830f915974e3207e086bb327896 | —                                        |
| codex/t08-rfq-lifecycle                           | 41cc0036d4878ab3e2a3de8d296693e5b813875d | 41cc0036d4878ab3e2a3de8d296693e5b813875d |
| codex/t08-t09-rfq-integration                     | 23c9d7321c733dee4f773fb2c3b3913b18b08350 | —                                        |
| codex/t08-t09-schema-integration                  | c3bf374ed3254a7699127d7216a6acc71b71f1a8 | —                                        |
| codex/t08-t10-desktop-integration                 | 0a42ebead9797250261297c35a9378507cc8c7f6 | —                                        |
| codex/t08-t10-desktop-integration-resolve         | 077148ba6ea309aa046f7c6a58a1340a1a7b6359 | 077148ba6ea309aa046f7c6a58a1340a1a7b6359 |
| codex/t08-t10-formal-integration                  | 43a641031a14a3c426955c5fcd86fe83c4c20486 | 43a641031a14a3c426955c5fcd86fe83c4c20486 |
| codex/t08-t10-p1-server-integration               | b203c70fd83a5dbcdb01fcaf9184d5b9fa9bbd13 | —                                        |
| codex/t09-receipt-payment                         | cbc129a05285a438a34525504ca719950a3e5527 | cbc129a05285a438a34525504ca719950a3e5527 |
| codex/t10-bd-structured-errors                    | 35b9f60c0b9c5df0d4283649455f1a7d5d991631 | —                                        |
| codex/t10-closure-gap-audit                       | 50378ddc0f52bcf2432199f0a6c6c38bf61dcb0c | —                                        |
| codex/t10-g2-formal-pull                          | 6e0a2a61fdf0967d75dc5edec3eed5e350056ef5 | —                                        |
| codex/t10-g2-status-audit                         | 0bc5a9b65a72b168496622c64d1a1c543b9f110b | 0bc5a9b65a72b168496622c64d1a1c543b9f110b |
| codex/t10-runtime-sync                            | 031ad670b90903c280f7b01567e7d6753bd8a3c9 | 031ad670b90903c280f7b01567e7d6753bd8a3c9 |
| codex/t10d-g4-order-conflicts                     | b190a82cf528fcd654b268abba3de6f139b42dee | —                                        |
| codex/t11-local-attachment-ingestion              | baca5084ff2befd278b9428242248d6a02bf46ba | —                                        |
| codex/t11a-security-fix1                          | 1d58b4c391499c682f6d3a9805a52e8b9d276fa3 | 1d58b4c391499c682f6d3a9805a52e8b9d276fa3 |
| codex/t11a-security-fix1-qa                       | be753b1b236e83ebce0991843b6888f1eabf4e00 | be753b1b236e83ebce0991843b6888f1eabf4e00 |
| codex/t13-sqlite-backup-recovery                  | d15a5f3039430819aa220bfa312f4db5be251c03 | —                                        |
| codex/v1-business-flow                            | a2b73ae9ee348fb6540b64a797b3274a9cb71450 | a2b73ae9ee348fb6540b64a797b3274a9cb71450 |
| codex/v1-delivery-closure-docs                    | e5e46362e51966d3fb3da1e040c42f866ff0a40e | —                                        |
| codex/v1-demo-recovery                            | baed1098a4dda993845617ee40b67047e063143a | —                                        |
| codex/v1-demo-screenshots                         | 17174f0f70ef95e39cd33fdc682785975d427f43 | —                                        |
| codex/v1-linux-deployment-gate                    | 1e71f13f5068742950ef6efbb94a918d727e251e | 1e71f13f5068742950ef6efbb94a918d727e251e |
| codex/v1-materials-gap                            | d0d6e858e4d3a53129c6ac9291bc66f646ab68da | 2b95a47653958754d5b278cb4d02be023bf846c4 |
| codex/v1-rc-20261024                              | f9145e1e4f62958e379f8f81c08971a9383c116b | —                                        |
| codex/v1-rc-control-20261025                      | 710edd7c622d8983fc5cf6af232b566d9e192b57 | 710edd7c622d8983fc5cf6af232b566d9e192b57 |
| codex/v1-rc-stabilization-20261025                | 710edd7c622d8983fc5cf6af232b566d9e192b57 | —                                        |
| codex/v1-release                                  | d3485144b075dceb8082e493c94791aab699a3af | —                                        |
| codex/v1-release-candidate                        | 700387baefec934b7fc370caece53d7445960496 | f4756afdb01ebac7b17ae9016d9ad56ab450fea5 |
| codex/v1-unified-baseline                         | d15a5f3039430819aa220bfa312f4db5be251c03 | d3485144b075dceb8082e493c94791aab699a3af |
| main                                              | 5139cc8f7d5a70cddb80b3ce5665100a316c9656 | 5139cc8f7d5a70cddb80b3ce5665100a316c9656 |

完整初始 local/remote ref 文本与逐文件处置 JSON 在归档中。特别：本地 codex/v1-release-candidate=700387baefec934b7fc370caece53d7445960496，是远端 f4756afdb01ebac7b17ae9016d9ad56ab450fea5 的祖先；本地 unified-baseline=d15a5f3，远端已为 d348514；release-toolbox 本地 e23de5b，远端 f9145e1。保留原指针，不强推“同步”。

后续总控封存的新增分支和原树状态见 [协调补充](COORDINATION-SUPPLEMENT.md)。
