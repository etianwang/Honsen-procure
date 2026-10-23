import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
const root=process.env.HONSEN_QA_ROOT, profile=join(root,'followup-receiver3.test.sqlite'), exe=join(root,'cargo-target','debug','HonsenProcure.exe')
const supplier='111d4ad4-9413-4706-b6a9-dd1508888637', price='d97fe474-7473-44e5-8178-0ca9ad763ea5'
const ids=[1,2,3,4,11,13].map(n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`)
const report={candidate:'20da0985fdb18b1e4a6571c54de8a0a4af40282c',checks:[],fixture:'previous task-owned receiver profile; SQLite authorization timestamps modified only for controlled boundary tests', errors:[]}
const db=new DatabaseSync(profile); db.exec('PRAGMA busy_timeout=5000')
let vite,exeProcess,browser
async function call(page,command,args={}) { return await page.evaluate(async({command,args})=>window.__TAURI__.core.invoke(command,args),{command,args}) }
async function offline(page,user,password) {const cap=await call(page,'issue_local_captcha'); const m=/^(\d+) \+ (\d+) = \?$/.exec(cap.question); assert.ok(m); return call(page,'offline_login',{request:{username:user,password,captchaId:cap.id,captchaAnswer:Number(m[1])+Number(m[2])}})}
async function sees(page) {return {supplier:(await call(page,'list_suppliers')).some(s=>s.id===supplier),quote:(await call(page,'search_catalog',{query:'',projectId:null})).flatMap(m=>m.prices).some(p=>p.priceId===price)}}
try {
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM local_suppliers WHERE id=?').get(supplier).n,1)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM local_material_prices WHERE id=?').get(price).n,1)
  const now=Math.floor(Date.now()/1000)
  db.prepare('UPDATE local_accounts SET cached_verified_at=? WHERE id IN (?,?)').run(now,ids[4],ids[5])
  vite=spawn('node.exe',[`${process.env.HONSEN_TARGET}/node_modules/vite/bin/vite.js`,'--host','127.0.0.1','--port','1421','--strictPort'],{cwd:`${process.env.HONSEN_TARGET}/apps/desktop`,windowsHide:true,stdio:'ignore',env:process.env})
  await expect.poll(async()=>{try{return (await fetch('http://127.0.0.1:1421')).ok}catch{return false}},{timeout:30000}).toBe(true)
  exeProcess=spawn(exe,[],{windowsHide:true,env:{...process.env,HONSEN_PROCURE_PROFILE:'test',HONSEN_PROCURE_TEST_DB_PATH:profile,WEBVIEW2_USER_DATA_FOLDER:`${root}/round2.webview`,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9263 --remote-debugging-address=127.0.0.1'}})
  await expect.poll(async()=>{try{return (await fetch('http://127.0.0.1:9263/json/version')).ok}catch{return false}},{timeout:60000}).toBe(true)
  browser=await chromium.connectOverCDP('http://127.0.0.1:9263')
  await expect.poll(()=>browser.contexts()[0]?.pages().length??0).toBeGreaterThan(0)
  const page=browser.contexts()[0].pages()[0]
  page.on('pageerror',e=>report.errors.push(e.message))
  await expect(page.getByRole('heading',{name:'登录 HONSEN Procure'})).toBeVisible({timeout:60000})
  await page.locator('#account').fill('engineer-a'); await page.locator('#password').fill(process.env.HONSEN_TEST_ENGINEER_A_PASSWORD)
  await page.getByRole('button',{name:'获取验证码'}).click()
  await expect(page.locator('label[for=captcha]')).toContainText('= ?')
  const m=(await page.locator('label[for=captcha]').textContent()).match(/(\d+) \+ (\d+) = \?/); assert.ok(m)
  await page.locator('#captcha').fill(String(Number(m[1])+Number(m[2])))
  await page.getByRole('button',{name:'离线登录'}).click()
  try { await expect(page.getByRole('button',{name:'材料库',exact:true})).toBeVisible({timeout:15000}) } catch (e) { report.loginUiText = (await page.locator('body').innerText()).slice(0,1200); try { await offline(page,'engineer-a',process.env.HONSEN_TEST_ENGINEER_A_PASSWORD); report.loginIpc='success' } catch (err) { report.loginIpc=err }; throw e }
  await page.getByRole('button',{name:'材料库',exact:true}).click()
  report.afterRevoke=await sees(page); assert.deepEqual(report.afterRevoke,{supplier:false,quote:false})
  assert.equal(await page.getByText('QA sync edited',{exact:false}).count(),0)
  report.checks.push('real EXE UI offline re-login with already refreshed revoked scope hides cached supplier; Rust IPC hides supplier and quote')
  db.prepare('INSERT OR REPLACE INTO local_authorization_snapshots (account_id,project_id,department_id,team_id,verified_at,expires_at) VALUES (?,?,?,?,?,?)').run(ids[4],ids[1],ids[2],ids[3],now,now+60)
  report.validSnapshot=await sees(page); assert.deepEqual(report.validSnapshot,{supplier:true,quote:true})
  db.prepare('UPDATE local_authorization_snapshots SET verified_at=?,expires_at=? WHERE account_id=?').run(now-2,now-1,ids[4])
  report.expiredSnapshot=await sees(page); assert.deepEqual(report.expiredSnapshot,{supplier:false,quote:false})
  report.checks.push('real EXE Rust IPC enforces controlled valid versus expired offline authorization snapshots')
  await call(page,'lock_session'); await offline(page,'purchaser',process.env.HONSEN_TEST_PURCHASER_PASSWORD)
  report.otherAuthorized=await sees(page); assert.deepEqual(report.otherAuthorized,{supplier:true,quote:true})
  report.checks.push('another authorized account accesses retained same-profile supplier and quote')
  await call(page,'lock_session'); db.prepare('UPDATE local_accounts SET cached_verified_at=? WHERE id=?').run(now-25*3600,ids[4])
  const expiredCap=await call(page,'issue_local_captcha'); const expiredAnswer=/^(\d+) \+ (\d+) = \?$/.exec(expiredCap.question); assert.ok(expiredAnswer)
  report.offline25h=await page.evaluate(async request=>{try{await window.__TAURI__.core.invoke('offline_login',{request});return 'accepted'}catch(e){return e.code}}, {username:'engineer-a',password:process.env.HONSEN_TEST_ENGINEER_A_PASSWORD,captchaId:expiredCap.id,captchaAnswer:Number(expiredAnswer[1])+Number(expiredAnswer[2])})
  assert.equal(report.offline25h,'offline_window_expired')
  report.checks.push('offline login with controlled 25-hour-old verified account is rejected')
  report.retained={supplier:db.prepare('SELECT COUNT(*) AS n FROM local_suppliers WHERE id=?').get(supplier).n,quote:db.prepare('SELECT COUNT(*) AS n FROM local_material_prices WHERE id=?').get(price).n}
  assert.deepEqual(report.retained,{supplier:1,quote:1}); report.result='PASS'
} catch(error) {report.result='INCOMPLETE';report.failure=String(error.stack??error);process.exitCode=1}
finally {writeFileSync(`${root}/round2-authorization-result.json`,JSON.stringify(report,null,2)); await browser?.close().catch(()=>{}); if(exeProcess?.exitCode===null) exeProcess.kill(); if(vite?.exitCode===null) vite.kill();db.close()}
