const express = require('express');
const cors = require('cors');
const authRoutes = require('./auth');
// Se você tiver um arquivo de rotas principal, importe aqui. 
// Caso contrário, o auth.js cuidará do login.

const app = express();
const PORT = process.env.PORT || 5000;

// Configuração de CORS - Liberando seu site no Netlify
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://famous-taiyaki-ec420a.netlify.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Rotas
app.use('/auth', authRoutes);

// Rota de teste para verificar se o servidor está online
app.get('/', (req, res) => {
  res.send('Servidor Barber Flow rodando!');
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
