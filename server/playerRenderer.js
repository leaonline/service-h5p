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
      console.log(event)
      const allInputs = document.querySelectorAll('input');
      allInputs.forEach(function(inp) {
        console.log(inp.value) 
      })
    });
</script>
</body>
</html>`
