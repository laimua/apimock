// 快速测试 API
async function testCreateEndpoint() {
  const response = await fetch('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Test Project ${Date.now()}`,
    }),
  });

  const project = await response.json();
  console.log('Created project:', project.data.id);

  // 创建端点
  const endpointResponse = await fetch(`http://localhost:3000/api/projects/${project.data.id}/endpoints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: '/test-api',
      method: 'GET',
      responseBody: { initial: true },
      statusCode: 201,
    }),
  });

  const endpoint = await endpointResponse.json();
  console.log('Created endpoint:', JSON.stringify(endpoint.data, null, 2));

  // 获取端点
  const getResponse = await fetch(`http://localhost:3000/api/projects/${project.data.id}/endpoints/${endpoint.data.id}`);
  const getEndpoint = await getResponse.json();
  console.log('Got endpoint:', JSON.stringify(getEndpoint.data, null, 2));
}

testCreateEndpoint().catch(console.error);
