# Runner replacement P1 — 有限修复批准方案（2026-11-04）

状态：**用户已于2026-11-04明确批准本文件A＋B有限修复及隔离验收；实施进行中，未完成独立验收。** 此项独立于已关闭的安装目录P1，也不等同于scope2字体/离线选择验收。

## 已确认事实与证据

实际旧019 registered Runner按现有公开apply参数升级到010，operation `f980205b-0f6f-45a2-8d4b-6e4d71e0e748`。标准调用退出0，OperationResult success/from0.1.9/to0.1.10，installerExitCode0。升级后主EXE/Manifest/登记均0.1.10、原目录和合成SQLite/marker保留，但Runner仍为旧019：

- 实际旧/升级后 Runner SHA `1943cac8e7bd8726f2f5ed6e0ad419d289bc82b2f3e946bce523d2e806f87f40`。
- 010包最终effective external Runner SHA `198093091d79159a62d01335b27dfe137bdd82b3f7e732faa34a27f065bff205`。
- 010安装包 SHA `4c69dbfaca53ea11e2da9d006b40fb126548358b05fd0b6c131a6c640d293890`，源码90f28043aecd74a90d3267952b922aea45845a88。

原始 `.cache/installed-security-019-existing/evidence/{upgrade-before.json,upgrade-after.json,upgrade-result.json,upgrade-operation.txt}`；包和generated NSIS已保存在 `H:/Honsen/artifacts/windows/90f2804-010/`。注意实际文件名是upgrade-operation.txt，不是operation.txt。

**确认缺陷：升级留下旧Runner，却报告成功。** Root随后独立卸载/全新安装010得到实际新Runner198093...，这与失败升级是两个不同场景，不能用重装结果把升级标PASS。

## 源码根因：确认与待证分开

确认：

1. 现CLI apply父进程同步等待临时copy worker；launch→apply还有一个等待中的launch父进程。原安装目录Runner映像可能持续被这些进程映射，不能为释放文件而让公开调用提前exit。
2. 上游固定模板直接File写主程序、resources、external binaries；本包两条同名Runner File写同一根目录，最后external entry才是有效预期。不能只取第一resource hash。
3. POSTINSTALL仍尝试从resources子目录CopyFiles Runner，然而当前generated资源已在根目录；此路径没有完成有效替换，也没有针对Runner复制错误进行fail-closed处理。
4. 现worker只查Runner存在，验证主EXE版本，没有校验新Runner版本/实际包内容；因此旧Runner存在即可穿过成功条件。这是确定的false-success校验缺口。

待证：运行中原Runner映像/共享权限是否是具体文件写失败的直接原因，以及哪条NSIS File/CopyFiles设置了错误标志。现有adapter只记录installer退出0，没有原生文件操作错误码，不能凭此宣称已捕获ERROR_SHARING_VIOLATION。实施后必须在隔离环境记录具体rename/copy/compare错误，不能以假定根因取代验收。

已重读固定Tauri上游模板（commit5b23c82ea5ba6b9aec420dd71f60493edc486aa9）；当前本地模板SHA63e28186...，原先仅四处默认目录修正。参考 [上游模板](https://github.com/tauri-apps/tauri/blob/5b23c82ea5ba6b9aec420dd71f60493edc486aa9/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi)。NSIS官方说明File可因无法覆盖而设置error flag，默认覆盖不等于已验证替换成功：[File](https://nsis.sourceforge.io/Reference/File)、[SetOverwrite](https://nsis.sourceforge.io/Reference/SetOverwrite)。本次不虚构silent错误的具体分支。

## 建议批准的最小机制

### A. UAC安装器内可靠发布Runner，不让调用父进程提前退出

- 仅Runner从generated external binaries中选择**唯一最终来源**；用NSIS编译期条件排除同名resource根目录写入，其他资源/二进制行为不改。不依赖未核实的Handlebars自定义helper。
- 在安装器私有临时区提取这个Runner payload；固定公开Runner文件名、安装目录和登记保持不变。安装器在既有runas/UAC权限内执行下列步骤，非提权worker不越权写ProgramFiles。
- 在写新Runner前，尝试将原固定路径Runner重命名为**本次唯一、同目录、不可覆盖的安装器私有in-use别名（`.honsen-runner-inuse-<UUID>.exe`）**。旧父进程继续运行其已映射映像，同步等待/result契约保持；不杀进程、不按进程名批量结束、不引入新常驻服务。
- 重命名若因共享/权限/路径冲突失败：安装器返回非零、记录失败，不静默skip、不延迟重启后假称成功。此机制能否在真实mapped父进程下成功，属于本次必须实际证明的兼容性前置；失败时不能擅加第二种绕过机制。
- 向空出的固定Runner路径写入唯一新payload。ClearErrors/IfErrors必须围住关键rename/copy/发布步骤；任何失败禁止写成功状态及自动重启。
- 在登记最终版本/退出0前，将新固定路径与本安装器提取的唯一payload进行**长度＋完整二进制内容比较**，并核验Windows文件版本。可用已有NSIS System插件调用受支持Windows文件API、固定大小缓冲分块比较；不下载未知hash插件、不调用Node/PowerShell作为安装时依赖。读取不完整、缓冲分配/IO错误一律失败。分块比较必须通过小/大/篡改/截断文件回归并衡量耗时，不能退化为仅比较文件存在或时间戳。
- 不自动回滚：若重命名后后续发布失败，保留诊断并返回失败，需要明确的修复安装接续，不擅自恢复整包/迁移目录。旧映像别名不是可自动回滚备份。
- 对本次私有旧映像别名，只可尝试删除**本次确切创建且仍在应用目录内的文件**；若仍被映射则保留并记录。后续高权限维护/卸载清理仅限经私有installer-owned记录核对的确切别名，拒绝reparse/目录外路径/未知文件，不扫描删除用户文件、不增加计划任务或重启删除队列。配对记录及校验固定为下节定义，不授权任意后续记录格式；不清理真实业务数据。

### A.1 固定的私有别名与ownership记录

仅在当前已经验证的 `InstallLocation` 根目录内创建一对文件：

- `.honsen-runner-inuse-<UUID>.exe`：被重命名的本次旧Runner映像；UUID由安装器本地生成，不来自公开CLI或不可信文件。
- `.honsen-runner-inuse-<UUID>.owner.ini`：同UUID的配对记录，且仅包含以下最小格式：

```ini
[Owner]
schemaVersion=1
appId=honsen.procure
operationUuid=<UUID>
exactFileName=.honsen-runner-inuse-<UUID>.exe
```

创建必须拒绝任何同名已有文件/目录，不能覆盖；ownership记录只在本次确实获得并持有该旧映像别名时成为可清理记录。构造/重命名失败的回收只处理本次已创建的确切项，不能因构造失败而删除一个尚未固定/从未拥有的路径。

本轮清理只使用内存中本次确切文件名。后续高权限维护/卸载只可从当前安装目录非递归读取配对owner记录，逐项验证schema=1/appId固定值/规范UUID、记录文件basename UUID与operationUuid完全相同、exactFileName逐字等于由该UUID计算出的固定basename。记录不得包含绝对/相对路径、分隔符、`..`或任意其他目录指向。未知字段、错误格式、孤立记录或无法证明配对关系时一律保留并记诊断，不把它当删除授权。

删除前重新验证安装目录真实路径及无reparse逃逸、记录/别名都是该目录内的普通非reparse文件；固定读取/比较所需句柄，防路径被并发替换；只对验证后的**精确字面文件名**执行Delete。不得使用通配符Delete、递归RMDir /r、RunOnce、计划任务、重启删除队列或自动回滚。若旧映像仍in-use导致Delete失败，保留这一对文件并在既有安装日志记留存原因，不让调用父进程提前exit，不为清理强杀进程。先确认旧别名删除成功，才删除相应owner记录；不因清理失败转而删除未知文件或上级目录。

这些文件均是安装器私有应用文件，不在业务数据目录，不改变公开Manifest/registry/result字段。仅此格式和清理边界获本次批准；不授权通用路径清理服务。

### B. Worker增加成功防线，首跳旧worker由安装器自身保证

- 新worker在返回success/任何restart=true启动前，除现有主EXE检查外，至少校验**固定路径Runner的实际Windows文件版本等于expected-version**，路径/存在/安装目录一致；错误走现有failed结果类型和已有step映射，不增公开字段/参数。
- 版本比较保留合法3/4段：完整4段相等照常接受，3段仅与补第4段0等价，非零第4段不得被忽略；不用反复trim_end_matches去掉多个零段。补1.0.0↔1.0.0.0、0.1.10、相同非零4段和非等价4段回归。这是本次新增Runner版本验证所必需，不顺带重写其他版本策略。
- 同版本修复/换字节仍依赖A的包内payload逐字节检查，而不是把版本相同当内容相同。
- **旧019 worker没有这条新校验，首跳升级不能只靠未来worker修复**；所以A必须在可信安装器内自身检查payload并正确返回非零，旧worker已有installer-exit处理即能拒绝失败。不得声称“只改Rust后置检查”能修复首次旧版升级。
- `run_from_temporary_copy`同步等待、私有worker链、互斥/UAC、专属operationId/resultPath、source仅记录来源均保持。不得以提前父进程退出/异步假成功解决锁定。

## 精确文件/修改范围

- `apps/desktop/src-tauri/packaging/windows/installer-template.nsi`：只Runner提取/唯一来源/发布流程以及关键错误处理；原默认目录、/D恢复、身份、其他资源安装/应用数据边界不动。
- `packaging/windows/toolbox-hooks.nsh`：去掉Runner过时子目录复制/删除；接入私有Runner最终检查且仅通过后登记。非Runner Manifest逻辑不顺带重构。
- 固定新增私有helper `apps/desktop/src-tauri/packaging/windows/runner-install.nsh`，仅实现上述文件比较、唯一别名、配对ownership记录及安全清理，使用已随NSIS分发的System能力；不新增其他helper或外部运行时/高权限下载脚本。
- `src/update_runner.rs`：新增Runner实际版本成功校验及正确的规范版本匹配；不改CLI/Manifest/OperationResult定义。
- `TEMPLATE-SOURCE.md`：明确新的本地Runner差异，不再声称只有四处默认路径改动；上游commit/license继续保留。
- 现有NSIS `VERSION` / `VERSIONWITHBUILD` 和generated external-binary输入足够。本次明确不修改 `scripts/build-windows-release.mjs`、Tauri配置或增加构建期输入；若实施发现确实需要额外输入，先报告追加精确范围并等待批准，不在本次授权内自动扩展。
- 直接定向Rust/NSIS/static-package/Windows安装验收脚本及现有integration、发布检查表和证据记录。不会修改业务API/数据库迁移/付款/COS/HPA/SPO。

## 必须完成的验收与风险

1. 固化本轮019→010 RED：旧Runner哈希未变但success。不能删历史或用fresh安装替代。
2. 新包从同一最终SHA构建，保存generated NSIS最后有效payload的真实SHA；fresh安装及**真正运行中的旧registeredRunner public apply升级**均须匹配新Runner bytes、main/Manifest/登记版本及原目录；合成SQLite/marker哈希保留。
3. 再经**新launch父进程→已装apply父进程→temp worker**升级（本地受控合成资产/私有测试注入仅限测试构建，不改生产canonical URL，不造正式Release），验证多父进程仍可靠替换且同步结果不提前完成。live stable仍缺时必须分开标明本地机制验收和真实线上链BLOCKED_ENV。
4. 强制rename拒绝/新文件写失败/截断或篡改payload/比较IO失败/版本不匹配/UAC取消：非零＋failed、无restart、旧/合成数据不删，不得再出现success+旧Runner。每项命名实际影响，不能拿单元PASS替代Windows文件共享实测。
5. exact旧别名清理、仍in-use保留、恶意receipt/reparse/目录外/未知文件不删；只在新建隔离目录放合成sentinel测试。
6. 原有目录P1只对未变边界复用；新Runner发布改动影响的升级/卸载/同版本修复必须定向补测，不重做无关业务/全量目录矩阵。
7. 新010字体/离线取消/继续成功是独立范围；新P1关闭前总体更新交付门禁保持FAIL/OPEN。

风险：mapped文件rename能力可能受权限/AV/额外共享句柄限制；必须fail-closed并保留实际错误。发布失败可能留下需要明确修复安装的部分状态，不承诺未获授权的自动回滚。旧私有映像可能暂占磁盘，清理必须安全且不得牺牲同步调用或用户数据。分块比较增加安装时间，必须有上限和真实测量。

**2026-11-04用户已明确批准本文件的A＋B成对修复和隔离验收，现按以上精确边界实施。** 此授权不包含scope3、目录迁移、自动回滚、生产安装、main修改、PR合并、正式Release或生产部署。

实施日志细节：使用固定私有 $TEMP\\Honsen Program\\RunnerInstall\\<installerUUID>\\installer.log（CREATE_NEW、无reparse、最小schema/appId/UUID/PID/phase/nativeError/bytes/elapsed/outcome）。它与既有Rust adapter installerLogPath分开，不声称DetailPrint自动写入adapter日志，不新增公开参数/结果字段或Rust日志关联改动。主Agent已确认这是已批准helper原生错误记录的实现细节。
