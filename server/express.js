import { Meteor } from 'meteor/meteor'
import { WebApp } from 'meteor/webapp'

import H5PNodeLibrary from 'h5p-nodejs-library'
import express from 'express'
import path from 'path'
import bodyParser from 'body-parser'
import fileUpload from 'express-fileupload'
import fs from 'fs'
import util from 'util'
import index from './index'

import DirectoryTemporaryFileStorage
  from 'h5p-nodejs-library/build/examples/implementation/DirectoryTemporaryFileStorage'
import InMemoryStorage from 'h5p-nodejs-library/build/examples/implementation/InMemoryStorage'
import JsonStorage from 'h5p-nodejs-library/build/examples/implementation/JsonStorage'
import EditorConfig from 'h5p-nodejs-library/build/examples/implementation/EditorConfig'
import FileLibraryStorage from 'h5p-nodejs-library/build/examples/implementation/FileLibraryStorage'
import FileContentStorage from 'h5p-nodejs-library/build/examples/implementation/FileContentStorage'
import User from 'h5p-nodejs-library/build/examples/implementation/User'
import examples from './examples.json'
import editorRenderer from './editorRenderer'

const exec = util.promisify(require('child_process').exec)
const H5PPlayer = H5PNodeLibrary.Player
const h5pRoute = '/h5p'
const libraryFileUrlResolver = (library, file) => `${h5pRoute}/libraries/${library.machineName}-${library.majorVersion}.${library.minorVersion}/${file}`

// we use this array to configure any external
// origins we want to allow to make requests
const { allowedOrigins } = Meteor.settings

const startup = async () => {
  const h5pEditor = new H5PNodeLibrary.Editor(
    new InMemoryStorage(),
    await new EditorConfig(new JsonStorage(path.resolve('assets/app/examples/config.json'))).load(),
    new FileLibraryStorage(path.resolve('assets/app/h5p/libraries')),
    new FileContentStorage(path.resolve('assets/app/h5p/content')),
    new H5PNodeLibrary.TranslationService(H5PNodeLibrary.englishStrings), libraryFileUrlResolver,
    new DirectoryTemporaryFileStorage(path.resolve('assets/app/h5p/temporary-storage'))
  )
  h5pEditor.useRenderer(editorRenderer)

  const user = new User()

  const server = express()

  // make this compatible with Meteor's http middleware
  WebApp.rawConnectHandlers.use(server)

  server.use(
    bodyParser.urlencoded({
      extended: true
    })
  )

  server.use(bodyParser.json())

  server.use(
    fileUpload({
      limits: { fileSize: 50 * 1024 * 1024 }
    }))

  server.use(function (req, res, next) {
    const { origin } = req.headers
    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin)
    } else {
      res.header('Access-Control-Allow-Origin', Meteor.absoluteUrl())
    }

    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    next()
  })

  server.get(`${h5pRoute}/libraries/:uberName/:file(*)`, async (req, res) => {
    const stream = h5pEditor.libraryManager.getFileStream(
      H5PNodeLibrary.LibraryName.fromUberName(req.params.uberName),
      req.params.file
    )
    stream.on('end', () => {
      res.end()
    })
    stream.pipe(res.type(path.basename(req.params.file)))
  })

  server.get(`${h5pRoute}/content/:id/content/:file(*)`, async (req, res) => {
    const stream = await h5pEditor.getContentFileStream(
      req.params.id,
      req.params.file,
      user
    )
    stream.on('end', () => {
      res.end()
    })
    stream.pipe(res.type(path.basename(req.params.file)))
  })

  server.get(
    `${h5pEditor.config.temporaryFilesPath}/:file(*)`,
    async (req, res) => {
      const stream = await h5pEditor.getContentFileStream(
        undefined,
        req.params.file,
        user
      )
      stream.on('end', () => {
        res.end()
      })
      stream.pipe(res.type(path.basename(req.params.file)))
    }
  )

  server.use(h5pRoute, express.static(`${path.resolve('')}/h5p`))

  server.use('/favicon.ico', express.static(`favicon.ico`))

  server.get('/', (req, res) => {
    fs.readdir('h5p/content', (error, files) => {
      if (error) files = []
      res.end(index({ contentIds: files, examples }))
    })
  })

  server.get('/play', (req, res) => {
    if (!req.query.contentId) {
      return res.redirect('/')
    }

    const libraryLoader = (lib, maj, min) =>
      h5pEditor.libraryManager.loadLibrary(
        new H5PNodeLibrary.LibraryName(lib, maj, min)
      )
    Promise.all([
      h5pEditor.contentManager.loadContent(req.query.contentId),
      h5pEditor.contentManager.loadH5PJson(req.query.contentId)
    ]).then(([ contentObject, h5pObject ]) =>
      new H5PPlayer(libraryLoader)
        .render(req.query.contentId, contentObject, h5pObject)
        .then(h5p_page => res.end(h5p_page))
        .catch(error => res.status(500).end(error.message))
    )
  })

  server.get('/download', async (req, res) => {
    if (!req.query.contentId) {
      return res.redirect('/')
    }

    const packageExporter = new H5PNodeLibrary.PackageExporter(
      h5pEditor.libraryManager,
      h5pEditor.translationService,
      h5pEditor.config,
      h5pEditor.contentManager
    )

    // set filename for the package with .h5p extension
    res.setHeader(
      'Content-disposition',
      `attachment; filename=${req.query.contentId}.h5p`
    )
    await packageExporter.createPackage(
      req.query.contentId,
      res,
      user
    )
  })

  server.get('/examples/:key', (req, res) => {
    let key = req.params.key
    let name = path.basename(examples[ key ].h5p)
    const tempPath = path.resolve('scripts/tmp')
    const tempFilename = path.join(tempPath, name)

    const libraryLoader = async (lib, maj, min) =>
      h5pEditor.libraryManager.loadLibrary(
        new H5PNodeLibrary.LibraryName(lib, maj, min)
      )

    exec(`sh scripts/download-example.sh ${examples[ key ].h5p}`)
      .then(async () => {
        const contentId = await h5pEditor.packageImporter.addPackageLibrariesAndContent(
          tempFilename,
          { canUpdateAndInstallLibraries: true }
        )
        const h5pObject = await h5pEditor.contentManager.loadH5PJson(
          contentId
        )
        const contentObject = await h5pEditor.contentManager.loadContent(
          contentId
        )
        return new H5PPlayer(libraryLoader).render(
          contentId,
          contentObject,
          h5pObject
        )
      })
      .then(h5p_page => res.end(h5p_page))
      .catch(error => res.status(500).end(error.message))
      .finally(() => {
        fs.unlinkSync(tempFilename)
        fs.rmdirSync(tempPath)
      })
  })

  server.get('/edit', async (req, res) => {
    h5pEditor.render(req.query.contentId).then(page => res.end(page))
  })

  server.get('/params', (req, res) => {
    h5pEditor
      .loadH5P(req.query.contentId)
      .then(content => {
        res.status(200).json(content)
      })
      .catch(() => {
        res.status(404).end()
      })
  })

  server.get('/ajax', (req, res) => {
    const { action } = req.query
    const { majorVersion, minorVersion, machineName, language } = req.query

    switch (action) {
      case 'content-type-cache':
        h5pEditor.getContentTypeCache(user).then(contentTypeCache => {
          res.status(200).json(contentTypeCache)
        })
        break

      case 'libraries':
        h5pEditor
          .getLibraryData(
            machineName,
            majorVersion,
            minorVersion,
            language
          )
          .then(library => {
            res.status(200).json(library)
          })
        break

      default:
        res.status(400).end()
        break
    }
  })

  server.post('/edit', (req, res) => {
    h5pEditor
      .saveH5P(
        req.query.contentId,
        req.body.params.params,
        req.body.params.metadata,
        req.body.library,
        user
      )
      .then(contentId => {
        const body = JSON.stringify({ contentId })
        res.status(200).end(body)
      })
  })

  server.post('/ajax', async (req, res) => {
    const { action } = req.query
    switch (action) {
      case 'libraries':
        const libraryOverview = await h5pEditor.getLibraryOverview(
          req.body.libraries
        )
        res.status(200).json(libraryOverview)
        break
      case 'translations':
        const translationsResponse = await h5pEditor.getLibraryLanguageFiles(
          req.body.libraries,
          req.query.language
        )
        res.status(200).json({
          success: true,
          data: translationsResponse
        })
        break
      case 'files':
        const uploadFileResponse = await h5pEditor.saveContentFile(
          req.body.contentId === '0'
            ? req.query.contentId
            : req.body.contentId,
          JSON.parse(req.body.field),
          req.files.file,
          user
        )
        res.status(200).json(uploadFileResponse)
        break
      case 'library-install':
        await h5pEditor.installLibrary(req.query.id, user)
        const contentTypeCache = await h5pEditor.getContentTypeCache(
          user
        )
        res.status(200).json({
          success: true,
          data: contentTypeCache
        })
        break
      case 'library-upload':
        const contentId = await h5pEditor.uploadPackage(
          req.files.h5p.data,
          req.query.contentId,
          user
        )
        const [ content, contentTypes ] = await Promise.all([
          h5pEditor.loadH5P(contentId),
          h5pEditor.getContentTypeCache(user)
        ])
        res.status(200).json({
          success: true,
          data: {
            h5p: content.h5p,
            content: content.params.params,
            contentTypes
          }
        })
        break
      default:
        res.status(500).end('NOT IMPLEMENTED')
        break
    }
  })

  // we don't listen to the port here, because Meteor has port listening
  // already been included in their middleware layer. Uses --PORT=8080 env var instead.
}

Meteor.startup(startup)
