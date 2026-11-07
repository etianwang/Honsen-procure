import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createApp } from '../app.js'
import { registerPasswordChange } from './password-change.js'
import { AuthorizationService } from '../authorization/service.js'
import { PostgresAuthorizationStore } from '../authorization/postgres-store.js'
import argon2 from 'argon2'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresAuthStore } from '../db/postgres-auth-store.js'
import { AuthService, hashToken } from './service.js'
import { registerAccounts } from './accounts.js'

const url = process.env.TEST_DATABASE_URL
const pool = url ? new Pool({ connectionString: url }) : null
let app: ReturnType<typeof createApp>
const actor = randomUUID(),
  token = randomUUID(),
  role = 'accounts_' + randomUUID().replaceAll('-', '')
const projectId = randomUUID(),
  departmentId = randomUUID(),
  teamId = randomUUID(),
  country = randomUUID()
let runtime: Pool
describe.skipIf(!pool)(
  'account creation through restricted PostgreSQL runtime',
  () => {
    beforeAll(async () => {
      await runMigrations(pool!)
      await pool!.query(
        "INSERT INTO users(id,business_code,username,password_hash,ui_locale,requires_password_change) VALUES($1::uuid,$1::text,$1::text,'fixture','zh-CN',FALSE)",
        [actor],
      )
      await pool!.query(
        "INSERT INTO user_roles(user_id,role) VALUES($1,'super_administrator')",
        [actor],
      )
      await pool!.query(
        "INSERT INTO account_sessions(id,user_id,token_hash,installation_id,expires_at) VALUES($1,$2,$3,$4,NOW()+interval '1 hour')",
        [randomUUID(), actor, hashToken(token), randomUUID()],
      )
      await pool!.query(
        "INSERT INTO countries(id,business_code,name,time_zone) VALUES($1::uuid,$1::text,'synthetic','UTC')",
        [country],
      )
      await pool!.query(
        "INSERT INTO projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES($1::uuid,$2::uuid,$1::text,'synthetic','site','department','XOF','zh_fr')",
        [projectId, country],
      )
      await pool!.query(
        "INSERT INTO departments(id,business_code,name) VALUES($1::uuid,$1::text,'synthetic')",
        [departmentId],
      )
      await pool!.query(
        "INSERT INTO teams(id,department_id,business_code,name) VALUES($1::uuid,$2::uuid,$1::text,'synthetic')",
        [teamId, departmentId],
      )
      const secret = randomUUID()
      await pool!.query(
        `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${secret}'`,
      )
      const grants = await readFile(
        new URL('../../../../deploy/baota/runtime-grants.sql', import.meta.url),
        'utf8',
      )
      await pool!.query(grants.replaceAll(':"runtime_role"', `"${role}"`))
      const connection = new URL(url!)
      connection.username = role
      connection.password = secret
      runtime = new Pool({ connectionString: connection.toString() })
      const auth = new AuthService(new PostgresAuthStore(runtime), {
        verify: argon2.verify,
      })
      app = createApp(
        auth,
        undefined,
        undefined,
        new AuthorizationService(new PostgresAuthorizationStore(runtime)),
      )
      registerAccounts(app, auth, runtime)
      registerPasswordChange(app, auth, runtime)
    })
    afterAll(async () => {
      await app.close()
      await runtime?.end()
      if (runtime) await pool!.query(`DROP OWNED BY "${role}"`)
      if (runtime) await pool!.query(`DROP ROLE "${role}"`)
      await pool!.end()
    })
    it('creates hashed first-login account atomically and never resets a duplicate', async () => {
      const username = 'synthetic' + randomUUID().replaceAll('-', ''),
        password = randomUUID()
      const payload = {
        username,
        temporaryPassword: password,
        displayName: '合成姓名',
        roles: ['administrator', 'purchaser'],
        uiLocale: 'zh-CN',
        employeePhotoKey: 'builtin:default-avatar:v1',
        scope: { projectId, departmentId, teamId },
      }
      const trigger = 'reject_account_' + randomUUID().replaceAll('-', '')
      for (const employeePhotoKey of ['', 'unknown-photo']) {
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/accounts',
              headers: { authorization: `Bearer ${token}` },
              payload: { ...payload, employeePhotoKey },
            })
          ).statusCode,
        ).toBe(400)
      }
      await pool!.query(
        `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_id='${actor}'::uuid AND NEW.action='account_created' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
      )
      try {
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/accounts',
              headers: { authorization: `Bearer ${token}` },
              payload,
            })
          ).statusCode,
        ).toBe(500)
        expect(
          (
            await pool!.query('SELECT id FROM users WHERE username=$1', [
              username,
            ])
          ).rowCount,
        ).toBe(0)
        expect(
          (
            await pool!.query(
              "SELECT id FROM audit_entries WHERE actor_id=$1 AND action='account_created'",
              [actor],
            )
          ).rowCount,
        ).toBe(0)
      } finally {
        await pool!.query(
          `DROP TRIGGER ${trigger} ON audit_entries; DROP FUNCTION ${trigger}()`,
        )
      }
      expect(
        (await app.inject({ method: 'POST', url: '/api/accounts', payload }))
          .statusCode,
      ).toBe(401)
      const headers = { authorization: `Bearer ${token}` }
      const concurrentName = 'Case' + randomUUID().replaceAll('-', '')
      const concurrent = await Promise.all(
        [concurrentName, concurrentName.toUpperCase()].map((username) =>
          app.inject({
            method: 'POST',
            url: '/api/accounts',
            headers,
            payload: { ...payload, username },
          }),
        ),
      )
      expect(concurrent.map((r) => r.statusCode).sort()).toEqual([201, 409])
      expect(
        (
          await pool!.query(
            "SELECT id FROM users WHERE translate(username,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=$1",
            [concurrentName.toLowerCase()],
          )
        ).rowCount,
      ).toBe(1)
      const response = await app.inject({
        method: 'POST',
        url: '/api/accounts',
        headers,
        payload,
      })
      expect(response.statusCode).toBe(201)
      expect(response.body).not.toContain(password)
      const saved = (
        await pool!.query('SELECT * FROM users WHERE username=$1', [username])
      ).rows[0]
      expect(saved.requires_password_change).toBe(true)
      expect(await argon2.verify(saved.password_hash, password)).toBe(true)
      const login = async (secret: string) => {
        const captcha = (
          await app.inject({ method: 'GET', url: '/api/auth/captcha' })
        ).json()
        const numbers = captcha.question.match(/\d+/g).map(Number)
        const result = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: { 'x-installation-id': randomUUID() },
          payload: {
            username: username.toUpperCase(),
            password: secret,
            captchaId: captcha.id,
            captchaAnswer: String(numbers[0] + numbers[1]),
          },
        })
        expect(result.statusCode).toBe(200)
        return result.json().accessToken as string
      }
      const firstToken = await login(password)
      const scopeUrl = '/api/authorization/bindings/' + saved.id
      expect(
        (await app.inject({ method: 'GET', url: scopeUrl })).statusCode,
      ).toBe(401)
      const firstHeaders = { authorization: `Bearer ${firstToken}` }
      const denied = await app.inject({
        method: 'GET',
        url: scopeUrl,
        headers: firstHeaders,
      })
      expect(denied.statusCode).toBe(403)
      expect(denied.json().code).toBe('PASSWORD_CHANGE_REQUIRED')
      const replacement = randomUUID()
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/change-password',
            headers: firstHeaders,
            payload: { currentPassword: password, newPassword: replacement },
          })
        ).statusCode,
      ).toBe(200)
      expect(
        (
          await app.inject({
            method: 'GET',
            url: scopeUrl,
            headers: firstHeaders,
          })
        ).statusCode,
      ).toBe(401)
      const fresh = await login(replacement)
      expect(
        (
          await app.inject({
            method: 'GET',
            url: scopeUrl,
            headers: { authorization: `Bearer ${fresh}` },
          })
        ).statusCode,
      ).toBe(200)
      const changedHash = (
        await pool!.query('SELECT password_hash FROM users WHERE id=$1', [
          saved.id,
        ])
      ).rows[0].password_hash
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/accounts',
            headers,
            payload,
          })
        ).statusCode,
      ).toBe(409)
      expect(
        (
          await pool!.query('SELECT password_hash FROM users WHERE id=$1', [
            saved.id,
          ])
        ).rows[0].password_hash,
      ).toBe(changedHash)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/accounts',
            headers,
            payload: { ...payload, roles: ['super_administrator'] },
          })
        ).statusCode,
      ).toBe(400)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/accounts',
            headers,
            payload: {
              ...payload,
              username: randomUUID().replaceAll('-', ''),
              scope: { ...payload.scope, teamId: randomUUID() },
            },
          })
        ).statusCode,
      ).toBe(403)
    })
    it('enforces live administrator scope and mandatory password change', async () => {
      const actor = randomUUID(),
        token = randomUUID()
      await pool!.query(
        "INSERT INTO users(id,business_code,username,password_hash,ui_locale,requires_password_change) VALUES($1::uuid,$1::text,$1::text,'fixture','zh-CN',FALSE)",
        [actor],
      )
      await pool!.query(
        "INSERT INTO user_roles(user_id,role) VALUES($1,'administrator')",
        [actor],
      )
      await pool!.query(
        "INSERT INTO account_sessions(id,user_id,token_hash,installation_id,expires_at) VALUES($1,$2,$3,$4,NOW()+interval '1 hour')",
        [randomUUID(), actor, hashToken(token), randomUUID()],
      )
      const headers = { authorization: `Bearer ${token}` }
      const payload = {
        username: randomUUID().replaceAll('-', ''),
        temporaryPassword: randomUUID(),
        displayName: '合成姓名',
        roles: ['engineer'],
        uiLocale: 'zh-CN',
        employeePhotoKey: 'builtin:default-avatar:v1',
        scope: { projectId, departmentId, teamId },
      }
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/accounts',
            headers,
            payload,
          })
        ).statusCode,
      ).toBe(403)
      await pool!.query(
        'INSERT INTO user_project_bindings(user_id,project_id) VALUES($1,$2)',
        [actor, projectId],
      )
      await pool!.query(
        'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1,$2,$3,$4)',
        [actor, projectId, departmentId, teamId],
      )
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/accounts',
            headers,
            payload: { ...payload, roles: ['purchaser'] },
          })
        ).statusCode,
      ).toBe(403)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/accounts',
            headers,
            payload,
          })
        ).statusCode,
      ).toBe(201)
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/accounts?username=' + payload.username,
            headers,
          })
        ).json(),
      ).toHaveLength(1)
      await pool!.query(
        'UPDATE user_project_scope_bindings SET deleted_at=NOW() WHERE user_id=$1',
        [actor],
      )
      const revokedUsername = randomUUID().replaceAll('-', '')
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/accounts',
            headers,
            payload: { ...payload, username: revokedUsername },
          })
        ).statusCode,
      ).toBe(403)
      expect(
        (
          await pool!.query('SELECT id FROM users WHERE username=$1', [
            revokedUsername,
          ])
        ).rowCount,
      ).toBe(0)
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/accounts?username=' + payload.username,
            headers,
          })
        ).json(),
      ).toHaveLength(0)
      await pool!.query(
        'UPDATE users SET requires_password_change=TRUE WHERE id=$1',
        [actor],
      )
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/accounts?username=' + payload.username,
            headers,
          })
        ).statusCode,
      ).toBe(403)
    })
    it('retains legacy Unicode accounts and their password hashes under casefold lookup', async () => {
      const id = randomUUID(),
        username = '测试' + randomUUID(),
        password = randomUUID()
      const hash = await argon2.hash(password)
      await pool!.query(
        "INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES($1::uuid,$1::text,$2,$3,'zh-CN')",
        [id, username, hash],
      )
      const account = await new PostgresAuthStore(
        runtime,
      ).findAccountByUsername(username)
      expect(account?.id).toBe(id)
      expect(account?.displayName).toBe(username)
      expect(await argon2.verify(account!.passwordHash, password)).toBe(true)
      expect(
        (
          await pool!.query(
            'SELECT password_hash,username FROM users WHERE id=$1',
            [id],
          )
        ).rows[0],
      ).toEqual({ password_hash: hash, username })
    })
  },
)
