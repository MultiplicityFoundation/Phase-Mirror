// Ensure LocalStack is running before tests
beforeAll(async () => {
  try {
    const response = await fetch('http://localhost:4566/_localstack/health');
    if (!response.ok) {
      throw new Error('LocalStack not running. Start with: docker-compose -f localstack-compose.yml up -d');
    }
    const health = await response.json();
    console.log('LocalStack health check passed:', health);
  } catch (error) {
    console.error('LocalStack health check failed:', error);
    throw new Error('LocalStack not running. Start with: docker-compose -f ../../localstack-compose.yml up -d');
  }
}, 10000);
