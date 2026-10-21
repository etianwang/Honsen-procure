import https from 'node:https'
import { existsSync, readFileSync, unlinkSync, appendFileSync } from 'node:fs'
const server = https.createServer(
  {
    pfx: readFileSync(process.env.HONSEN_PROCURE_TEST_TLS_PFX),
    passphrase: process.env.HONSEN_PROCURE_TEST_TLS_PFX_PASSWORD,
  },
  (req, res) => {
    const drop =
      req.method === 'POST' &&
      req.url === '/api/sync/category-repairs' &&
      existsSync(process.env.T04_DROP_FLAG)
    if (drop) unlinkSync(process.env.T04_DROP_FLAG)
    const upstream = https.request(
      {
        hostname: 'localhost',
        port: 3443,
        path: req.url,
        method: req.method,
        headers: req.headers,
        rejectUnauthorized: false,
      },
      (response) => {
        if (drop) {
          response.resume()
          response.on('end', () => {
            appendFileSync(
              process.env.T04_PROXY_LOG,
              `dropped completed response status=${response.statusCode}\n`,
            )
            res.destroy()
          })
        } else {
          res.writeHead(response.statusCode, response.headers)
          response.pipe(res)
        }
      },
    )
    upstream.on('error', (error) => {
      appendFileSync(
        process.env.T04_PROXY_LOG,
        `upstream error ${error.message}\n`,
      )
      res.destroy()
    })
    req.pipe(upstream)
  },
)
server.listen(3444, '127.0.0.1', () =>
  console.log('QA response-loss proxy ready'),
)
