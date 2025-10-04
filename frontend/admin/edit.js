// Вспомогательная функция для выполнения аутентифицированных запросов
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('adminToken');
    const headers = {
        'X-Admin-Token': token,
        ...options.headers,
    };

    try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 401) {
            showToast('Сессия истекла или недействительна. Пожалуйста, войдите снова.', 'error');
            // Даем время показать сообщение перед редиректом
            setTimeout(() => {
                window.location.href = 'index.html'; // Перенаправляем на страницу логина
            }, 1500);
            throw new Error('Unauthorized');
        } else if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Неизвестная ошибка' }));
            showToast(`Ошибка: ${errorData.error || errorData.message || 'Неизвестная ошибка'}`, 'error');
            throw new Error(errorData.error || errorData.message || 'Network response was not ok');
        }

        return response;
    } catch (error) {
        // Если это ошибка авторизации, не показываем дополнительное сообщение
        if (error.message === 'Unauthorized') {
            throw error;
        }
        // Для других ошибок сети показываем сообщение
        showToast(`Ошибка сети: ${error.message}`, 'error');
        throw error;
    }
}

let selectedFile = null; // Глобальная переменная для выбранного файла
let cameraMode = 'productImage'; // 'productImage' или 'ocr'

document.addEventListener('DOMContentLoaded', () => {
    const userRole = localStorage.getItem('userRole');
    const isDemoUser = userRole === 'demo';
    
    // Инициализация счетчика AI использований для демо-пользователя
    if (isDemoUser) {
        if (!localStorage.getItem('demoAiUsageCount')) {
            localStorage.setItem('demoAiUsageCount', '0');
        }
        
        // Для демо-пользователя оставляем кнопку сохранения, но меняем её поведение
        const saveButton = document.querySelector('button[onclick="saveProduct()"]');
        if (saveButton) {
            saveButton.onclick = function() {
                alert('Сохранение в демо-режиме недоступно.');
                return false;
            };
        }
        
        // Инициализация счетчика AI использований для демо-пользователя
        if (!localStorage.getItem('demoAiUsageCount')) {
            localStorage.setItem('demoAiUsageCount', '0');
        }
        
        // Добавляем обработчики для подсчета AI использований
        setupDemoAiUsageTracking();
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const pageTitle = document.getElementById('edit-page-title');
    const nameInput = document.getElementById('edit-name');
    const clearNameBtn = document.getElementById('clear-name-btn');

    // --- Логика для авто-изменения высоты textarea ---
    function adjustTextareaHeight(textarea) {
        textarea.style.height = 'auto'; // Сброс высоты
        textarea.style.height = (textarea.scrollHeight) + 'px';
    }

    nameInput.addEventListener('input', () => {
        adjustTextareaHeight(nameInput);
        clearNameBtn.classList.toggle('hidden', !nameInput.value);
    });
    // --- Конец логики ---

    clearNameBtn.addEventListener('click', () => {
        nameInput.value = '';
        clearNameBtn.classList.add('hidden');
        nameInput.focus();
    });


    if (productId) {
        pageTitle.textContent = 'Редактирование товара';
        // Загрузка данных о товаре
        authenticatedFetch(`${window.APP_CONFIG.API_BASE_URL}/api/products?id=${productId}`) // Используем прямой эндпоинт для получения одного товара
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(product => {
                if (product) {
                    document.getElementById('edit-product-id').value = product.id;
                    const nameTextarea = document.getElementById('edit-name');
                    nameTextarea.value = product.name;
                    adjustTextareaHeight(nameTextarea); // Устанавливаем правильную высоту при загрузке
                    // После установки значения нужно проверить, показывать ли крестик
                    clearNameBtn.classList.toggle('hidden', !product.name);
                    document.getElementById('edit-description').value = product.description;
                    document.getElementById('edit-price').value = product.price;
                    document.getElementById('edit-discount-percentage').value = product.discountPercentage || '';
                    document.getElementById('edit-quantity').value = product.quantityRaw;
                    document.getElementById('edit-category').value = product.category;
                    document.getElementById('edit-image-url').value = product.imageUrl || '';
                    document.getElementById('edit-barcode').value = product.barcode || product.id; // Используем ID как fallback для штрихкода
                    if (product.imageUrl) {
                        const preview = document.getElementById('image-preview');
                        const placeholderIcon = document.getElementById('image-placeholder-icon');
                        preview.src = product.imageUrl;
                        preview.classList.remove('hidden');
                        placeholderIcon.classList.add('hidden');
                    }
                } else {
                     console.error('Product not found:', productId);
                     pageTitle.textContent = 'Ошибка: Товар не найден';
                }
            })
            .catch(error => {
                console.error('Failed to fetch product:', error);
                pageTitle.textContent = 'Ошибка загрузки товара';
            });
    } else {
        pageTitle.textContent = 'Создание товара';
    }

    // --- Новая логика для загрузки изображений ---
    const capturePhotoBtn = document.getElementById('capture-photo-btn');
    const attachPhotoBtn = document.getElementById('attach-photo-btn');
    const capturePhotoInput = document.getElementById('capture-photo-input');
    const attachPhotoInput = document.getElementById('attach-photo-input');
    const imagePreview = document.getElementById('image-preview');
    const imagePlaceholderIcon = document.getElementById('image-placeholder-icon');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    // --- Новая логика для камеры с getUserMedia ---
    const cameraModal = document.getElementById('camera-modal');
    const cameraVideo = document.getElementById('camera-video');
    const takePictureBtn = document.getElementById('take-picture-btn');
    const closeCameraModalBtn = document.getElementById('close-camera-modal-btn');
    const ocrNameBtn = document.getElementById('ocr-name-btn');
    let stream;

    capturePhotoBtn.addEventListener('click', () => {
        cameraMode = 'productImage';
        openCamera();
    });
    
    ocrNameBtn.addEventListener('click', () => {
        cameraMode = 'ocr';
        openCamera();
    });

    attachPhotoBtn.addEventListener('click', () => attachPhotoInput.click());

    async function openCamera() {
        if (!('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices)) {
            alert('Ваш браузер не поддерживает доступ к камере. Попробуйте прикрепить файл.');
            return;
        }

        try {
            const constraints = {
                video: {
                    facingMode: { exact: "environment" },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            cameraVideo.srcObject = stream;
            cameraModal.classList.remove('hidden');
        } catch (err) {
            console.error("Ошибка доступа к задней камере, пробую любую:", err);
            try {
                 const anyCameraConstraints = { video: true };
                 stream = await navigator.mediaDevices.getUserMedia(anyCameraConstraints);
                 cameraVideo.srcObject = stream;
                 cameraModal.classList.remove('hidden');
            } catch (finalErr) {
                alert('Не удалось получить доступ к камере. Проверьте разрешения в настройках браузера.');
                console.error("Не удалось получить доступ ни к одной камере:", finalErr);
            }
        }
    }

    function closeCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        cameraModal.classList.add('hidden');
    }

    closeCameraModalBtn.addEventListener('click', closeCamera);

    takePictureBtn.addEventListener('click', () => {
        const canvas = document.createElement('canvas');
        canvas.width = cameraVideo.videoWidth;
        canvas.height = cameraVideo.videoHeight;
        canvas.getContext('2d').drawImage(cameraVideo, 0, 0);
        
        canvas.toBlob((blob) => {
            const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
            if (cameraMode === 'ocr') {
                handleOcrFile(file);
            } else {
                handleFileSelect(file);
            }
            closeCamera();
        }, 'image/jpeg', 0.95);
    });
    // --- Конец новой логики для камеры ---

    capturePhotoInput.addEventListener('change', (event) => handleFileSelect(event.target.files[0]));
    attachPhotoInput.addEventListener('change', (event) => handleFileSelect(event.target.files[0]));

    function handleFileSelect(file) {
        if (!file) return;

        selectedFile = file;
        document.getElementById('edit-image-url').value = ''; // Очищаем URL, если выбран файл

        const reader = new FileReader();
        
        reader.onloadstart = () => {
            loadingSpinner.classList.remove('hidden');
            imagePreview.classList.add('hidden');
            imagePlaceholderIcon.classList.add('hidden');
        };

        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreview.classList.remove('hidden');
            loadingSpinner.classList.add('hidden');
        };

        reader.onerror = () => {
            loadingSpinner.classList.add('hidden');
            imagePlaceholderIcon.classList.remove('hidden');
            showToast('Не удалось прочитать файл.', 'error');
        };

        reader.readAsDataURL(file);
    }

    async function handleOcrFile(file) {
        if (!file) return;

        const userRole = localStorage.getItem('userRole');
        const isDemoUser = userRole === 'demo';
        
        // Проверяем лимит для демо-пользователя
        if (isDemoUser) {
            const usageCount = parseInt(localStorage.getItem('demoAiUsageCount') || '0');
            if (usageCount >= 3) {
                alert('Лимит AI функций исчерпан. Демо-пользователь может использовать AI функции только 3 раза.');
                return;
            }
        }

        const ocrBtn = document.getElementById('ocr-name-btn');
        const ocrBtnIcon = document.getElementById('ocr-name-btn-icon');
        const ocrBtnSpinner = document.getElementById('ocr-name-btn-spinner');

        ocrBtn.disabled = true;
        ocrBtnIcon.classList.add('hidden');
        ocrBtnSpinner.classList.remove('hidden');

        try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await authenticatedFetch(`${window.APP_CONFIG.API_BASE_URL}/api/admin?action=recognizeTitleFromImage`, {
                method: 'POST',
                body: formData,
            });
            
            const data = await response.json();

            if (data.recognizedTitle) {
                nameInput.value = data.recognizedTitle;
                clearNameBtn.classList.toggle('hidden', !nameInput.value);
                
                // Увеличиваем счетчик для демо-пользователя при успешном выполнении
                if (isDemoUser) {
                    const usageCount = parseInt(localStorage.getItem('demoAiUsageCount') || '0');
                    localStorage.setItem('demoAiUsageCount', (usageCount + 1).toString());
                }
            } else {
                alert('Не удалось распознать название. Попробуйте сделать фото более четким.');
            }
        } catch (error) {
            console.error('Error recognizing title from image:', error);
            
            // Для демо-пользователя показываем более понятное сообщение
            if (isDemoUser && error.message.includes('Timed out') || error.message.includes('E101')) {
                alert('OCR функция временно недоступна для демо-пользователя. Пожалуйста, используйте другие AI функции.');
            } else {
                alert(`Ошибка при распознавании: ${error.message}`);
            }
        } finally {
            ocrBtn.disabled = false;
            ocrBtnIcon.classList.remove('hidden');
            ocrBtnSpinner.classList.add('hidden');
            cameraMode = 'productImage'; // Сбрасываем режим по умолчанию
        }
    }
    // --- Конец новой логики ---

    // Pre-initialize the barcode reader for the edit page
    const hints = new Map();
    const formats = [ZXing.BarcodeFormat.EAN_13];
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
    codeReaderEdit = new ZXing.BrowserMultiFormatReader(hints);

    const voiceButton = document.getElementById('start-voice-recognition');
    // const nameInput = document.getElementById('edit-name'); // Уже объявлено выше

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        voiceButton.style.display = 'none';
        console.log('Speech Recognition API не поддерживается в этом браузере.');
    } else {
        const recognition = new SpeechRecognition();
        recognition.lang = 'ru-RU';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        let isRecognizing = false;

        voiceButton.addEventListener('click', () => {
            if (isRecognizing) {
                recognition.stop();
                return;
            }
            recognition.start();
        });

        // Функция для воспроизведения звукового сигнала
        function playStartSound() {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.type = 'sine';
            oscillator.frequency.value = 880; // A5 note
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
        }

        recognition.onstart = () => {
            isRecognizing = true;
            voiceButton.innerHTML = '<i class="fas fa-stop"></i>';
            voiceButton.classList.remove('bg-blue-500', 'hover:bg-blue-600');
            voiceButton.classList.add('bg-red-500', 'hover:bg-red-600');
            playStartSound(); // Воспроизводим звук, когда распознавание началось
        };

        recognition.onend = () => {
            isRecognizing = false;
            voiceButton.innerHTML = '<i class="fas fa-microphone"></i>';
            voiceButton.classList.remove('bg-red-500', 'hover:bg-red-600');
            voiceButton.classList.add('bg-blue-500', 'hover:bg-blue-600');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            
            // Показываем индикатор загрузки
            voiceButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            voiceButton.disabled = true;

            // Отправляем текст на сервер для коррекции
            authenticatedFetch(`${window.APP_CONFIG.API_BASE_URL}/api/admin?action=correctTitle&text=${encodeURIComponent(transcript)}`, {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                if (data.correctedText) {
                    nameInput.value = data.correctedText;
                } else {
                    console.error('Correction failed:', data.error);
                    alert('Не удалось скорректировать название.');
                    nameInput.value = transcript; // Вставляем исходный текст в случае ошибки
                }
            })
            .catch(error => {
                console.error('Error correcting title:', error);
                alert('Ошибка при коррекции названия.');
                nameInput.value = transcript; // Вставляем исходный текст в случае ошибки
            })
            .finally(() => {
                // Возвращаем кнопку в исходное состояние
                voiceButton.innerHTML = '<i class="fas fa-microphone"></i>';
                voiceButton.disabled = false;
            });
        };

        recognition.onerror = (event) => {
            console.error('Ошибка распознавания речи:', event.error);
            alert(`Ошибка распознавания: ${event.error}`);
        };

        // Автоматически останавливаем распознавание, когда пользователь перестал говорить
        recognition.onspeechend = () => {
            recognition.stop();
        };
    }

    const generateDescBtn = document.getElementById('generate-description-btn');
    const descriptionInput = document.getElementById('edit-description');

    generateDescBtn.addEventListener('click', () => {
        const productName = nameInput.value;
        if (!productName) {
            alert('Пожалуйста, сначала введите название товара.');
            return;
        }

        const originalBtnText = generateDescBtn.textContent;
        generateDescBtn.textContent = 'Генерация...';
        generateDescBtn.disabled = true;

        authenticatedFetch(`${window.APP_CONFIG.API_BASE_URL}/api/admin?action=generateDescription&name=${encodeURIComponent(productName)}`, {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.description) {
                descriptionInput.value = data.description;
            } else {
                console.error('Description generation failed:', data.error);
                alert('Не удалось сгенерировать описание.');
            }
        })
        .catch(error => {
            console.error('Error generating description:', error);
            alert('Ошибка при генерации описания.');
        })
        .finally(() => {
            generateDescBtn.textContent = originalBtnText;
            generateDescBtn.disabled = false;
        });
    });

    // Обработчики для кнопок +/-
    document.querySelectorAll('.quantity-btn').forEach(button => {
        button.addEventListener('click', () => {
            const fieldId = button.dataset.field;
            const action = button.dataset.action;
            const step = parseInt(button.dataset.step, 10);
            const input = document.getElementById(fieldId);
            
            let currentValue = parseInt(input.value, 10) || 0;

            if (action === 'increment') {
                currentValue += step;
            } else {
                currentValue -= step;
            }

            if (currentValue < 0) {
                currentValue = 0;
            }

            input.value = currentValue;
        });
    });

    // Валидация для поля "Количество" - только цифры
    const quantityInput = document.getElementById('edit-quantity');
    quantityInput.addEventListener('input', () => {
        quantityInput.value = quantityInput.value.replace(/[^0-9]/g, '');
    });

    // Валидация для поля "Цена" - только цифры
    const priceInput = document.getElementById('edit-price');
    priceInput.addEventListener('input', () => {
        priceInput.value = priceInput.value.replace(/[^0-9]/g, '');
    });

    // Валидация для поля "Штрихкод" - только цифры
    const barcodeInput = document.getElementById('edit-barcode');
    barcodeInput.addEventListener('input', () => {
        barcodeInput.value = barcodeInput.value.replace(/[^0-9]/g, '');
    });

    // Логика модального окна категорий
    const categoryModal = document.getElementById('category-modal');
    const openCategoryModalBtn = document.getElementById('open-category-modal-btn');
    const closeCategoryModalBtn = document.getElementById('close-category-modal-btn');
    const categoryListDiv = document.getElementById('category-list');
    const categoryInput = document.getElementById('edit-category');

    async function loadCategories() {
        try {
            const response = await authenticatedFetch(`${window.APP_CONFIG.API_BASE_URL}/api/categories`);
            const categories = await response.json();
            categoryListDiv.innerHTML = ''; // Очищаем список
            categories.forEach(category => {
                const categoryItem = document.createElement('button');
                categoryItem.type = 'button';
                categoryItem.className = 'w-full text-left p-2 rounded-md hover:bg-gray-100';
                categoryItem.textContent = category;
                categoryItem.addEventListener('click', () => {
                    categoryInput.value = category;
                    categoryModal.classList.add('hidden');
                });
                categoryListDiv.appendChild(categoryItem);
            });
        } catch (error) {
            console.error('Failed to load categories:', error);
            categoryListDiv.innerHTML = '<p class="text-red-500">Не удалось загрузить категории.</p>';
        }
    }

    openCategoryModalBtn.addEventListener('click', () => {
        categoryModal.classList.remove('hidden');
        loadCategories(); // Загружаем категории при каждом открытии
    });

    closeCategoryModalBtn.addEventListener('click', () => {
        categoryModal.classList.add('hidden');
    });

    // Закрытие модального окна по клику на оверлей
    categoryModal.addEventListener('click', (event) => {
        if (event.target === categoryModal) {
            categoryModal.classList.add('hidden');
        }
    });

    // Логика модального окна поиска изображений
    const imageSearchModal = document.getElementById('image-search-modal');
    const openImageSearchModalBtn = document.getElementById('open-image-search-modal-btn');
    const closeImageSearchModalBtn = document.getElementById('close-image-search-modal-btn');
    const imageSearchResultsDiv = document.getElementById('image-search-results');
    const imageUrlInput = document.getElementById('edit-image-url');

    openImageSearchModalBtn.addEventListener('click', async () => {
        const productName = nameInput.value;
        if (!productName) {
            alert('Пожалуйста, сначала введите название товара.');
            return;
        }

        imageSearchResultsDiv.innerHTML = '<p>Ищем изображения...</p>';
        imageSearchModal.classList.remove('hidden');

        try {
            // Единый запрос на сервер, который генерирует ключи и ищет картинки (с кэшем)
            const response = await authenticatedFetch(`${window.APP_CONFIG.API_BASE_URL}/api/admin?action=searchImages&productName=${encodeURIComponent(productName)}`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.images && data.images.length > 0) {
                imageSearchResultsDiv.innerHTML = '';
                data.images.forEach(image => {
                    const imgElement = document.createElement('img');
                    imgElement.src = image.link; // Используем полную ссылку для лучшего качества
                    imgElement.className = 'w-full h-32 object-cover rounded-md cursor-pointer hover:opacity-75 transition';
                    imgElement.addEventListener('click', () => {
                        imageUrlInput.value = image.link;

                        // Прямое обновление превью
                        const preview = document.getElementById('image-preview');
                        const placeholderIcon = document.getElementById('image-placeholder-icon');
                        preview.src = image.link;
                        preview.classList.remove('hidden');
                        placeholderIcon.classList.add('hidden');

                        // Сбрасываем выбранные файлы, чтобы избежать конфликтов
                        document.getElementById('capture-photo-input').value = '';
                        document.getElementById('attach-photo-input').value = '';
                        
                        // Правильно сбрасываем локальный файл
                        selectedFile = null;

                        imageSearchModal.classList.add('hidden');
                    });
                    imageSearchResultsDiv.appendChild(imgElement);
                });
            } else {
                imageSearchResultsDiv.innerHTML = '<p>Изображения не найдены.</p>';
            }
        } catch (error) {
            console.error('Failed to search images:', error);
            imageSearchResultsDiv.innerHTML = '<p class="text-red-500">Не удалось выполнить поиск.</p>';
        }
    });

    closeImageSearchModalBtn.addEventListener('click', () => {
        imageSearchModal.classList.add('hidden');
    });

    imageSearchModal.addEventListener('click', (event) => {
        if (event.target === imageSearchModal) {
            imageSearchModal.classList.add('hidden');
        }
    });

    // Логика модального окна для предложений названий
    const nameSuggestionsModal = document.getElementById('name-suggestions-modal');
    const generateNameBtn = document.getElementById('generate-name-btn');
    const closeNameSuggestionsModalBtn = document.getElementById('close-name-suggestions-modal-btn');
    const nameSuggestionsList = document.getElementById('name-suggestions-list');

    generateNameBtn.addEventListener('click', async () => {
        const keywords = nameInput.value;
        if (!keywords) {
            alert('Пожалуйста, введите ключевые слова для генерации названия.');
            return;
        }

        const originalBtnText = generateNameBtn.textContent;
        generateNameBtn.textContent = 'Думаем...';
        generateNameBtn.disabled = true;

        try {
            const response = await authenticatedFetch(`${window.APP_CONFIG.API_BASE_URL}/api/admin?action=generateTitles&keywords=${encodeURIComponent(keywords)}`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.suggestions && data.suggestions.length > 0) {
                nameSuggestionsList.innerHTML = '';
                data.suggestions.forEach(suggestion => {
                    const suggestionItem = document.createElement('button');
                    suggestionItem.type = 'button';
                    suggestionItem.className = 'w-full text-left p-2 rounded-md hover:bg-gray-100';
                    suggestionItem.textContent = suggestion;
                    suggestionItem.addEventListener('click', () => {
                        nameInput.value = suggestion;
                        nameSuggestionsModal.classList.add('hidden');
                        // Обновляем состояние кнопки "очистить"
                        clearNameBtn.classList.toggle('hidden', !nameInput.value);
                    });
                    nameSuggestionsList.appendChild(suggestionItem);
                });
                nameSuggestionsModal.classList.remove('hidden');
            } else {
                alert('Не удалось сгенерировать варианты названий. Попробуйте изменить ключевые слова.');
            }
        } catch (error) {
            console.error('Error generating titles:', error);
            alert('Произошла ошибка при генерации названий.');
        } finally {
            generateNameBtn.textContent = originalBtnText;
            generateNameBtn.disabled = false;
        }
    });

    closeNameSuggestionsModalBtn.addEventListener('click', () => {
        nameSuggestionsModal.classList.add('hidden');
    });

    nameSuggestionsModal.addEventListener('click', (event) => {
        if (event.target === nameSuggestionsModal) {
            nameSuggestionsModal.classList.add('hidden');
        }
    });
});

async function saveProduct() {
    const userRole = localStorage.getItem('userRole');
    if (userRole === 'demo') {
        alert('Демо-пользователь не может сохранять товары. Пожалуйста, войдите под учетной записью администратора.');
        return;
    }
    
    const loadingOverlay = document.getElementById('loading-overlay');
    const saveButton = document.querySelector('button[onclick="saveProduct()"]');

    // Показываем оверлей и блокируем кнопку
    loadingOverlay.classList.remove('hidden');
    saveButton.disabled = true;
    saveButton.classList.add('opacity-50', 'cursor-not-allowed');

    try {
        const productId = document.getElementById('edit-product-id').value;
        let imageUrl = document.getElementById('edit-image-url').value;

        // Приоритет у локально выбранного файла
        if (selectedFile) {
            const formData = new FormData();
            formData.append('image', selectedFile);
            const response = await authenticatedFetch(`${window.APP_CONFIG.API_BASE_URL}/api/admin?action=uploadImage`, {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Ошибка загрузки изображения');
            }
            imageUrl = data.imageUrl;
        }

        const productData = {
            id: productId,
            name: document.getElementById('edit-name').value,
            description: document.getElementById('edit-description').value,
            price: document.getElementById('edit-price').value,
            discountPercentage: document.getElementById('edit-discount-percentage').value,
            quantity: document.getElementById('edit-quantity').value,
            category: document.getElementById('edit-category').value,
            imageUrl: imageUrl,
            barcode: document.getElementById('edit-barcode').value
        };

        const action = productId ? 'updateProduct' : 'createProduct';
        
        const saveResponse = await authenticatedFetch(`${window.APP_CONFIG.API_BASE_URL}/api/admin?action=${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(productData)
        });

        if (!saveResponse.ok) {
            const errorData = await saveResponse.json();
            throw new Error(errorData.error || 'Ошибка сохранения товара');
        }

        // После успешного сохранения товара обновляем Redis кеш
        console.log('Товар успешно сохранен, обновляем кеш...');
        try {
            const cacheResponse = await authenticatedFetch(`${window.APP_CONFIG.API_BASE_URL}/api/update-caches`, {
                method: 'POST'
            });
            if (cacheResponse.ok) {
                console.log('Кеш успешно обновлен');
            } else {
                console.warn('⚠️ Не удалось обновить кеш, но товар сохранен');
            }
        } catch (cacheError) {
            console.warn('⚠️ Ошибка при обновлении кеша:', cacheError);
            // Продолжаем выполнение, так как товар уже сохранен
        }

        // Агрессивно очищаем весь локальный кеш фронтенда
        if (window.localStorage) {
            // Очищаем все кеши продуктов, категорий и поиска
            localStorage.removeItem('viewCache');
            localStorage.removeItem('categoriesCache');
            localStorage.removeItem('lastKnownBuildVersion');
            localStorage.removeItem('shoppingCart'); // Очищаем корзину, чтобы избежать конфликтов
            localStorage.removeItem('orderFormData');
            localStorage.removeItem('privacyPolicyAccepted');
            localStorage.removeItem('customerOrders');
            
            // Очищаем sessionStorage если используется
            if (window.sessionStorage) {
                sessionStorage.clear();
            }
            
            console.log('Локальный кеш фронтенда полностью очищен');
        }
        
        // Добавляем параметр для принудительного обновления при редиректе
        const timestamp = new Date().getTime();
        console.log('✅ Товар сохранен, перенаправляем на главную с принудительным обновлением...');
        
        // Добавляем небольшую задержку, чтобы дать время Redis обновиться
        setTimeout(() => {
            window.location.href = `index.html?forceRefresh=${timestamp}`;
        }, 1500);

    } catch (error) {
        console.error('Save product error:', error);
        alert(`Не удалось сохранить товар: ${error.message}`);
        // Скрываем оверлей и разблокируем кнопку в случае ошибки
        loadingOverlay.classList.add('hidden');
        saveButton.disabled = false;
        saveButton.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// Barcode scanning logic for edit page
let codeReaderEdit;
let videoElementEdit;
let barcodeResultElementEdit;
let scannerContainerEdit;
let selectedDeviceIdEdit = null; // Переменная для хранения ID выбранной камеры



async function startBarcodeScanEdit() {
    scannerContainerEdit = document.getElementById('barcode-scanner-container-edit');
    videoElementEdit = document.getElementById('barcode-video-edit');
    barcodeResultElementEdit = document.getElementById('barcode-result-edit');

    scannerContainerEdit.classList.remove('hidden');
    barcodeResultElementEdit.textContent = 'Наведите камеру на штрихкод...';

    if (!codeReaderEdit) {
        console.error("Barcode reader on edit page is not initialized.");
        barcodeResultElementEdit.textContent = 'Ошибка инициализации сканера.';
        return;
    }

    try {
        if (selectedDeviceIdEdit === null) {
            // Если ID камеры еще не выбран, получаем список устройств
            const devices = await codeReaderEdit.listVideoInputDevices();
            if (devices.length > 0) {
                 // Пытаемся найти заднюю камеру по названию
                const rearCamera = devices.find(device => 
                    device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('rear')
                );
                if (rearCamera) {
                    selectedDeviceIdEdit = rearCamera.deviceId;
                    console.log('Выбрана задняя камера с ID:', selectedDeviceIdEdit);
                } else {
                    // Если задняя камера не найдена по названию, выбираем первую доступную
                    selectedDeviceIdEdit = devices[0].deviceId;
                    console.log('Задняя камера не найдена по названию, выбрана первая доступная камера с ID:', selectedDeviceIdEdit);
                }
            } else {
                barcodeResultElementEdit.textContent = 'Камера не найдена.';
                console.error('Камера не найдена.');
                return; // Прекращаем выполнение, если нет камер
            }
        }
        

        // Используем выбранный ID камеры для сканирования
        await codeReaderEdit.decodeFromVideoDevice(selectedDeviceIdEdit, videoElementEdit, (result, err) => {
            if (result) {
                console.log('Штрихкод найден:', result.text);
                const scannedText = result.text.trim();

                // Проверяем, является ли отсканированный текст числом (ID товара)
                if (/^\d+$/.test(scannedText)) {
                    barcodeResultElementEdit.textContent = `Найден штрихкод: ${scannedText}`;
                    // Устанавливаем найденный штрихкод в поле ввода
                    document.getElementById('edit-barcode').value = scannedText;
                    stopBarcodeScanEdit();
                } else {
                    // Игнорируем нечисловые результаты
                    barcodeResultElementEdit.textContent = 'Отсканирован неверный формат. Наведите на штрихкод товара.';
                    console.warn('Отсканирован нечисловой результат:', scannedText);
                }
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
                console.error(err);
                barcodeResultElementEdit.textContent = 'Ошибка сканирования.';
            }
        });
    } catch (err) {
        console.error(err);
        barcodeResultElementEdit.textContent = 'Ошибка доступа к камере.';
    }
}

function stopBarcodeScanEdit() {
    if (codeReaderEdit) {
        codeReaderEdit.reset();
    }
    if (scannerContainerEdit) {
        scannerContainerEdit.classList.add('hidden');
    }
    // Не сбрасываем selectedDeviceIdEdit, чтобы использовать ту же камеру при следующем запуске
}

// Функция для отслеживания использования AI функций демо-пользователем
function setupDemoAiUsageTracking() {
    const userRole = localStorage.getItem('userRole');
    if (userRole !== 'demo') return;
    
    // Получаем текущее количество использований
    let usageCount = parseInt(localStorage.getItem('demoAiUsageCount') || '0');
    let imageSearchUsed = localStorage.getItem('demoImageSearchUsed') === 'true';
    
    // Функция для проверки лимита
    function checkAiUsageLimit(buttonId) {
        // Для поиска фото в Google отдельный лимит - 1 раз
        if (buttonId === 'open-image-search-modal-btn') {
            if (imageSearchUsed) {
                alert('Поиск фото в Google доступен только 1 раз для демо-пользователя.');
                return false;
            }
            return true;
        }
        
        // Для остальных AI функций - общий лимит 3 раза
        if (usageCount >= 3) {
            alert('Лимит AI функций исчерпан. Демо-пользователь может использовать AI функции только 3 раза.');
            return false;
        }
        return true;
    }
    
    // Функция для увеличения счетчика
    function incrementAiUsage(buttonId) {
        // Для поиска фото в Google отдельный счетчик
        if (buttonId === 'open-image-search-modal-btn') {
            imageSearchUsed = true;
            localStorage.setItem('demoImageSearchUsed', 'true');
        } else {
            // Для остальных AI функций общий счетчик
            usageCount++;
            localStorage.setItem('demoAiUsageCount', usageCount.toString());
        }
    }
    
    // Добавляем обработчики для AI кнопок
    const aiButtons = [
        'ocr-name-btn',
        'start-voice-recognition',
        'generate-description-btn',
        'open-image-search-modal-btn',
        'generate-name-btn'
    ];
    
    aiButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            const originalOnClick = button.onclick;
            
            button.onclick = function(event) {
                if (!checkAiUsageLimit(buttonId)) {
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }
                
                // Увеличиваем счетчик только при успешном выполнении
                // Для этого нужно перехватывать успешные запросы
                if (buttonId === 'ocr-name-btn') {
                    // Для OCR перехватываем успешный результат
                    const originalHandleOcrFile = window.handleOcrFile;
                    window.handleOcrFile = async function(file) {
                        try {
                            await originalHandleOcrFile.call(this, file);
                            incrementAiUsage(buttonId);
                        } catch (error) {
                            // Не увеличиваем счетчик при ошибке
                        }
                    };
                } else if (buttonId === 'start-voice-recognition') {
                    // Для голосового ввода увеличиваем счетчик при успешном распознавании
                    const recognition = window.recognition;
                    if (recognition) {
                        const originalOnResult = recognition.onresult;
                        recognition.onresult = function(event) {
                            if (originalOnResult) originalOnResult.call(this, event);
                            incrementAiUsage(buttonId);
                        };
                    }
                } else {
                    // Для других AI функций увеличиваем счетчик сразу
                    incrementAiUsage(buttonId);
                }
                
                if (originalOnClick) {
                    return originalOnClick.call(this, event);
                }
            };
        }
    });
    
    // Перехватываем успешные AI запросы для других функций
    const originalAuthenticatedFetch = window.authenticatedFetch;
    window.authenticatedFetch = async function(url, options = {}) {
        const response = await originalAuthenticatedFetch.call(this, url, options);
        
        // Проверяем, является ли запрос AI функцией
        const isAiFunction = url.includes('correctTitle') ||
                            url.includes('generateTitles') ||
                            url.includes('generateDescription') ||
                            url.includes('searchImages');
        
        if (isAiFunction && response.ok && userRole === 'demo') {
            // Определяем тип функции для правильного подсчета
            if (url.includes('searchImages')) {
                // Поиск фото в Google - отдельный счетчик
                if (!imageSearchUsed) {
                    imageSearchUsed = true;
                    localStorage.setItem('demoImageSearchUsed', 'true');
                }
            } else {
                // Остальные AI функции - общий счетчик
                if (usageCount < 3) {
                    usageCount++;
                    localStorage.setItem('demoAiUsageCount', usageCount.toString());
                }
            }
        }
        
        return response;
    };
}
