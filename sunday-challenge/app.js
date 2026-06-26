const questions = [
    // Type 1: Cake & Egg Logic
    {
        type: "Type 1: Cake & Egg Logic",
        text: "Anis wants to bake some cakes. Each cake requires 3 eggs. Anis has 20 eggs. What is the maximum number of cakes she can bake?",
        answer: 6,
        unit: "cakes",
        solution: "20 ÷ 3 = 6 with 2 left over"
    },
    {
        type: "Type 1: Cake & Egg Logic",
        text: "Leo is building toy cars. Each toy car requires 4 wheels. If Leo has 22 wheels, what is the maximum number of complete toy cars he can build?",
        answer: 5,
        unit: "toy cars",
        solution: "22 ÷ 4 = 5 with 2 left over"
    },
    {
        type: "Type 1: Cake & Egg Logic",
        text: "A baker is packing boxes of donuts. Each box holds 6 donuts. If there are 29 donuts, what is the maximum number of boxes that can be completely filled?",
        answer: 4,
        unit: "boxes",
        solution: "29 ÷ 6 = 4 with 5 left over"
    },
    
    // Type 2: Stamp & Toy Car Logic
    {
        type: "Type 2: Stamp & Toy Car Logic",
        text: "Liam has 35 toy cars. After buying some more, his total collection is 24 fewer than Noah's collection. Noah has 82 toy cars. How many toy cars did Liam buy?",
        answer: 23,
        unit: "toy cars",
        solution: "Noah has 82. Liam has 24 fewer than Noah (82 - 24 = 58). So Liam bought 58 - 35 = 23 toy cars."
    },
    {
        type: "Type 2: Stamp & Toy Car Logic",
        text: "Chloe saved $55. After her mom gave her some more money, Chloe's total savings were $18 less than Maya's. Maya has $92. How many dollars did Chloe's mom give her?",
        answer: 19,
        unit: "dollars",
        solution: "Maya has 92. Chloe has 18 less than Maya (92 - 18 = 74). Chloe's mom gave her 74 - 55 = 19 dollars."
    },
    {
        type: "Type 2: Stamp & Toy Car Logic",
        text: "Ethan has 42 comic books. When he buys some more, his new total is 15 less than Logan's. Logan has 70 comic books. How many comic books did Ethan buy?",
        answer: 13,
        unit: "comic books",
        solution: "Logan has 70. Ethan has 15 less than Logan (70 - 15 = 55). Ethan bought 55 - 42 = 13 comic books."
    },

    // Type 3: Flower & Sticker Logic
    {
        type: "Type 3: Flower & Sticker Logic",
        text: "Hannah had 22 stickers. Jose gave her some more stickers. Hannah then used 18 of her stickers for an art project and had 31 stickers left over. How many stickers did Jose give her?",
        answer: 27,
        unit: "stickers",
        solution: "Working backward: End with 31. Before using 18, she had 31 + 18 = 49. So Jose gave her 49 - 22 = 27 stickers."
    },
    {
        type: "Type 3: Flower & Sticker Logic",
        text: "A bus started its route with 15 passengers. At the first stop, some more passengers got on. At the second stop, 12 passengers got off, leaving 24 passengers on the bus. How many passengers got on at the first stop?",
        answer: 21,
        unit: "passengers",
        solution: "Working backward: 24 passengers left + 12 who got off = 36 passengers before the second stop. So 36 - 15 = 21 passengers got on."
    },
    {
        type: "Type 3: Flower & Sticker Logic",
        text: "Zoe had 14 colored pencils. Her teacher gave her some more. Zoe then lent 9 pencils to her classmate and was left with 20 pencils. How many pencils did the teacher give her?",
        answer: 15,
        unit: "pencils",
        solution: "Working backward: 20 pencils left + 9 lent out = 29 pencils. So the teacher gave her 29 - 14 = 15 pencils."
    },

    // Type 4: Kites & Sales Logic
    {
        type: "Type 4: Kites & Sales Logic",
        text: "Stall X sold 32 hundreds fewer kites than Stall Y. Stall X sold 2800 kites. How many kites did the two stalls sell altogether?",
        answer: 8800,
        unit: "kites",
        solution: "32 hundreds = 3200. Y = 2800 + 3200 = 6000. Total = 2800 (X) + 6000 (Y) = 8800."
    },
    {
        type: "Type 4: Kites & Sales Logic",
        text: "Company A sold 14 hundreds fewer smartphones than Company B. Company A sold 4500 smartphones. How many smartphones did both companies sell altogether?",
        answer: 10400,
        unit: "smartphones",
        solution: "14 hundreds = 1400. B = 4500 + 1400 = 5900. Total = 4500 (A) + 5900 (B) = 10400."
    },
    {
        type: "Type 4: Kites & Sales Logic",
        text: "Warehouse X stored 25 hundreds fewer boxes than Warehouse Y. Warehouse X stored 3100 boxes. How many boxes did both warehouses store in total?",
        answer: 8700,
        unit: "boxes",
        solution: "25 hundreds = 2500. Y = 3100 + 2500 = 5600. Total = 3100 (X) + 5600 (Y) = 8700."
    },

    // Type 5: Digits Logic
    {
        type: "Type 5: Digits Logic",
        text: "Kevin is given 4 digits. All the digits add up to 19. There are no zeros and all 4 digits are different. What is the largest possible value that he can form using the 4 digits?",
        answer: 9721,
        unit: "",
        solution: "To make it largest, first digit must be 9. Remaining sum = 10. Next largest unique is 7. Remaining sum = 3. Remaining unique digits must be 2 and 1. Digits: 9, 7, 2, 1 -> 9721."
    },
    {
        type: "Type 5: Digits Logic",
        text: "Diana is given 4 digits. All the digits add up to 17. There are no zeros and all 4 digits must be different. What is the largest possible value she can form using these 4 digits?",
        answer: 9521,
        unit: "",
        solution: "To make it largest, start with 9. Remaining sum = 8. Next unique largest is 5. Remaining sum = 3. Remaining unique digits are 2 and 1. Digits: 9, 5, 2, 1 -> 9521."
    },
    {
        type: "Type 5: Digits Logic",
        text: "Ethan wants to make the largest possible 4-digit number using unique, non-zero digits that add up to 16. What is this maximum number?",
        answer: 9421,
        unit: "",
        solution: "Start with 9. Remaining sum = 7. Next unique largest is 4. Remaining sum = 3. Remaining unique digits are 2 and 1. Digits: 9, 4, 2, 1 -> 9421."
    }
];

let currentIndex = 0;
let score = 0;
let userHistory = [];

// DOM Elements
const typeEl = document.getElementById('question-type');
const textEl = document.getElementById('question-text');
const inputEl = document.getElementById('answer-input');
const unitEl = document.getElementById('answer-unit');
const submitBtn = document.getElementById('submit-btn');
const feedbackEl = document.getElementById('feedback-msg');
const progressBar = document.getElementById('progress-bar');
const questionCounter = document.getElementById('question-counter');
const scoreCounter = document.getElementById('score-counter');
const quizContainer = document.getElementById('quiz-container');
const summaryContainer = document.getElementById('summary-container');
const finalScoreEl = document.getElementById('final-score');
const summaryFeedbackEl = document.getElementById('summary-feedback');
const restartBtn = document.getElementById('restart-btn');
const historyListEl = document.getElementById('history-list');

function loadQuestion() {
    const q = questions[currentIndex];
    typeEl.textContent = q.type;
    textEl.textContent = q.text;
    
    if (q.unit) {
        unitEl.textContent = q.unit;
        unitEl.style.display = 'inline';
    } else {
        unitEl.style.display = 'none';
    }

    inputEl.value = '';
    inputEl.focus();
    feedbackEl.className = 'feedback';
    feedbackEl.innerHTML = '';
    
    // Update progress
    const progress = (currentIndex / questions.length) * 100;
    progressBar.style.width = `${progress}%`;
    questionCounter.textContent = `Question ${currentIndex + 1} of ${questions.length}`;
    scoreCounter.textContent = `Score: ${score}`;
    
    // Animate card entrance
    quizContainer.style.animation = 'none';
    quizContainer.offsetHeight; // trigger reflow
    quizContainer.style.animation = 'slideUp 0.5s ease-out';
}

function checkAnswer() {
    const userAnswer = parseInt(inputEl.value, 10);
    const q = questions[currentIndex];

    if (isNaN(userAnswer)) {
        feedbackEl.textContent = 'Please enter a number!';
        feedbackEl.className = 'feedback show incorrect shake';
        inputEl.classList.add('shake');
        setTimeout(() => inputEl.classList.remove('shake'), 400);
        return;
    }

    let isCorrect = (userAnswer === q.answer);

    if (isCorrect) {
        score++;
        feedbackEl.innerHTML = `Awesome! That is correct! 🎉<br><div class="solution-text"><strong>Solution:</strong> ${q.solution}</div>`;
        feedbackEl.className = 'feedback show correct';
        fireConfetti(true);
    } else {
        feedbackEl.innerHTML = `Oops! The correct answer was ${q.answer}.<br><div class="solution-text"><strong>Solution:</strong> ${q.solution}</div>`;
        feedbackEl.className = 'feedback show incorrect';
    }

    userHistory.push({
        question: q,
        userAnswer: userAnswer,
        isCorrect: isCorrect
    });

    submitBtn.disabled = true;
    scoreCounter.textContent = `Score: ${score}`;

    // Move to next question after a delay so they can read the solution
    setTimeout(() => {
        currentIndex++;
        submitBtn.disabled = false;
        if (currentIndex < questions.length) {
            loadQuestion();
        } else {
            showSummary();
        }
    }, 5000); // 5 second delay to read the solution
}

function showSummary() {
    progressBar.style.width = '100%';
    quizContainer.classList.add('hidden');
    summaryContainer.classList.remove('hidden');
    finalScoreEl.textContent = score;

    if (score === questions.length) {
        summaryFeedbackEl.textContent = 'Perfect score! You are a Math Genius! 🏆';
        fireConfetti(false);
    } else if (score >= questions.length * 0.7) {
        summaryFeedbackEl.textContent = 'Great job! You did amazing! 🌟';
    } else {
        summaryFeedbackEl.textContent = 'Good effort! Keep practicing to improve! 💪';
    }

    // Render History
    historyListEl.innerHTML = '';
    userHistory.forEach((record, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        
        const statusClass = record.isCorrect ? 'status-correct' : 'status-incorrect';
        const statusText = record.isCorrect ? 'Correct ✅' : 'Incorrect ❌';

        item.innerHTML = `
            <div class="history-question">Q${index + 1}: ${record.question.text}</div>
            <div class="history-status ${statusClass}">${statusText}</div>
            <div class="history-user-answer"><strong>Your Answer:</strong> ${record.userAnswer} ${record.question.unit} &nbsp;&nbsp;|&nbsp;&nbsp; <strong>Correct Answer:</strong> ${record.question.answer} ${record.question.unit}</div>
            <div class="history-solution"><strong>Solution:</strong> ${record.question.solution}</div>
        `;
        historyListEl.appendChild(item);
    });
}

function fireConfetti(small) {
    const duration = small ? 1000 : 3000;
    const end = Date.now() + duration;

    (function frame() {
        confetti({
            particleCount: small ? 3 : 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#FF6B6B', '#4ECDC4', '#FFE66D']
        });
        confetti({
            particleCount: small ? 3 : 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#FF6B6B', '#4ECDC4', '#FFE66D']
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

function restartQuiz() {
    currentIndex = 0;
    score = 0;
    userHistory = [];
    summaryContainer.classList.add('hidden');
    quizContainer.classList.remove('hidden');
    loadQuestion();
}

submitBtn.addEventListener('click', checkAnswer);
inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnswer();
});
restartBtn.addEventListener('click', restartQuiz);

// Initialize
loadQuestion();
