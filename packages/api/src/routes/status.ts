import { Router, Request, Response } from 'express';

export const statusRouter = Router();

statusRouter.get('/', (_req: Request, res: Response): void => {
  res.json({ status: 'ok', service: 'WhatAgent API', version: '1.0.0', build: '6795889' });
});
