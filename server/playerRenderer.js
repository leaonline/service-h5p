
const targetUrl = Meteor.settings.targetUrl

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
    H5P.externalDispatcher.on('xAPI', function (event) {  
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
      
      let responses = []
      let contentType
            
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
        
        // first build inputs structure
        const allInputs = document.querySelectorAll('.h5p-answer');
        allInputs.forEach(function(inp) {
          const index = inp.getAttribute('data-id')
          const checked = Boolean(inp.getAttribute('aria-checked'))
          responses.push({ index: parseInt(index, 10), checked: checked ? "1" : "0" })
        })
        
        // then sort and map to single string value array
        responses = responses.sort((a, b) => a - b).map(entry => console.log(entry.index) || entry.checked)
      }
      
      params.type = contentType
      params.responses = responses
      
      if (!params.userId || !params.sessionId || !params.taskId) return
      
      var xhr = new XMLHttpRequest();
      xhr.open("POST", '/response', true);
      
      //Send the proper header information along with the request
      xhr.setRequestHeader("Content-Type", 'application/json');
      
      xhr.onreadystatechange = function() { // Call a function when the state changes.
        if (this.readyState === XMLHttpRequest.DONE && this.status !== 200) {
             console.warn('unexpected result', this.status)
             console.warn(this.getAllResponseHeaders())
          }
      }
      xhr.send(JSON.stringify(params));
    });
</script>
</body>
</html>`
