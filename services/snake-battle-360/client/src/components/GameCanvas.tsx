import React, { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { snakes, mySnakeId } = useGameStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    let animationFrame: number;

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mySnake = snakes.find(s => s.id === mySnakeId) || snakes.find(s => s.isPlayer) || snakes[0];
      if (mySnake) {
        const head = mySnake.body[0];
        if (head) {
          const offsetX = head.x - canvas.width / 2;
          const offsetY = head.y - canvas.height / 2;
          ctx.save();
          ctx.translate(-offsetX, -offsetY);
          snakes.forEach(snake => {
            ctx.beginPath();
            ctx.moveTo(snake.body[0].x, snake.body[0].y);
            for (let i = 1; i < snake.body.length; i++) {
              ctx.lineTo(snake.body[i].x, snake.body[i].y);
            }
            ctx.strokeStyle = snake.color || 'green';
            ctx.lineWidth = 10;
            ctx.stroke();
          });
          ctx.restore();
        }
      }
      animationFrame = requestAnimationFrame(render);
    }

    render();
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
    };
  }, [snakes, mySnakeId]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
