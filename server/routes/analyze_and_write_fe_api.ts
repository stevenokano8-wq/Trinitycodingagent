import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Define the user interface
interface User {
  id: string;
  name: string;
  email: string;
  password: string;
}

// Initialize the users array
let users: User[] = [];

// Create an Express app
const app = express();
app.use(express.json());

// Middleware to authenticate using JWT
const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).send('Access denied. No token provided.');
  try {
    const decoded = jwt.verify(token, 'secretkey') as any;
    req.user = decoded;
    next();
  } catch (ex) {
    return res.status(400).send('Invalid token.');
  }
};

// Endpoint to register a new user
app.post('/api/register', (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  const user: User = {
    id: uuidv4(),
    name,
    email,
    password: bcrypt.hashSync(password, 10),
  };
  users.push(user);
  res.send(user);
});

// Endpoint to login a user
app.post('/api/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(400).send('Invalid email or password');
  const isValidPassword = bcrypt.compareSync(password, user.password);
  if (!isValidPassword) return res.status(400).send('Invalid email or password');
  const token = jwt.sign({ id: user.id }, 'secretkey');
  res.send(token);
});

// Endpoint to get all users (requires authentication)
app.get('/api/users', authenticate, (req: Request, res: Response) => {
  res.send(users);
});

// Endpoint to get a user by id (requires authentication)
app.get('/api/users/:id', authenticate, (req: Request, res: Response) => {
  const user = users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).send('User not found');
  res.send(user);
});

// Endpoint to update a user (requires authentication)
app.put('/api/users/:id', authenticate, (req: Request, res: Response) => {
  const user = users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).send('User not found');
  user.name = req.body.name;
  user.email = req.body.email;
  res.send(user);
});

// Endpoint to delete a user (requires authentication)
app.delete('/api/users/:id', authenticate, (req: Request, res: Response) => {
  const user = users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).send('User not found');
  users = users.filter((u) => u.id !== req.params.id);
  res.send(users);
});

// Start the server
const port = 3000;
app.listen(port, () => console.log(`Server started on port ${port}`));