export default model => `<!doctype html>
<html class="h5p-iframe">
<head>
    <meta charset="utf-8">
    
    ${model.styles.map(style => `<link rel="stylesheet" href="${style}"/>`).join('\n    ')}
    ${model.scripts.map(script => `<script src="${script}"></script>`).join('\n    ')}
    <script>
        H5PIntegration = ${JSON.stringify(model.integration, null, 2)};
    </script>
    ${model.customScripts}
</head>
<body>
    <div class="h5p-content" data-content-id="${model.contentId}"></div>
    <script>
    H5P.externalDispatcher.on('*', function (event) {  
      const responses = []
      const params = {}
      const urlParams = new URLSearchParams(window.location.search)
      const contentId = urlParams.get('contentId')
      params.userId = urlParams.get('userId')
      params.sessionId = urlParams.get('sessionId')
      params.taskId = urlParams.get('taskId')
      params.contentId = contentId
      
      const cid = 'cid-' + contentId
      const contentSrc = H5PIntegration.contents[cid]
      const library = contentSrc.library
      let contentType
      
      console.log(H5PIntegration)
      
      if (library.indexOf('Blanks') > -1) {
        contentType = 'blanks'
        const allInputs = document.querySelectorAll('input');
        allInputs.forEach(function(inp) {
            responses.push(inp.value)
        })
      }
      
      if (library.indexOf('MultiChoice') > -1) {
        const jsonContent = JSON.parse(contentSrc.jsonContent)
        contentType = jsonContent.behaviour.type + 'choice'
        const allInputs = document.querySelectorAll('.h5p-answer');
        allInputs.forEach(function(inp) {
          const dataId = inp.getAttribute('data-id')
          const checked = inp.getAttribute('aria-checked')
          responses.push({ dataId, checked })
        })
      }
      
      params.type = contentType
      params.responses = responses
      
      console.log('send params', params)
    });
</script>
</body>
</html>`
