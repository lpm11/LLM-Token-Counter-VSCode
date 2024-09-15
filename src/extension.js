const vscode = require('vscode');
const { encoding_for_model } = require('tiktoken');
const { countTokens } = require('@anthropic-ai/tokenizer');

let encoder = null;  // Initialize encoder as null

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    let statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = "gpt-token-counter-live.changeModel";

    const modelProviders = {
        'openai': [
            'gpt-4o',
            'gpt-4',
            'gpt-3.5-turbo',
            'text-davinci-003',
            'davinci',
            'babbage',
        ],
        'anthropic': [
            'anthropic',
        ]
    };

    const specialTokens = {
        'gpt-4o': ['<|endoftext|>'],
        'gpt-4': ['<|endoftext|>'],
        'gpt-3.5-turbo': ['<|endoftext|>'],
        'text-davinci-003': ['<|endoftext|>'],
        'davinci': ['<|endoftext|>'],
        'babbage': ['<|endoftext|>'],
        'anthropic': [], // Unified Anthropic model
    };

    // Initialize currentModel with default from configuration
    const config = vscode.workspace.getConfiguration('gptTokenCounterLive');
    let defaultModel = config.get('defaultModel') || modelProviders.openai[0];
    const [provider, model] = defaultModel.includes(':') ? defaultModel.split(': ') : ['openai', defaultModel];
    let currentProvider = provider;
    let currentModel = model;

    context.subscriptions.push(statusBar);

    // Function to initialize the encoder
    function initializeEncoder(model) {
        if (encoder) {
            encoder.free();
        }
        encoder = encoding_for_model(model);
    }

    // Function to handle special tokens
    function handleSpecialTokens(text, model) {
        const tokens = specialTokens[model] || [];
        let specialTokenCount = 0;
        tokens.forEach(token => {
            const occurrences = text.split(token).length - 1;
            specialTokenCount += occurrences;
            text = text.split(token).join('');
        });
        return { text, specialTokenCount };
    }

    let updateTokenCount = () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            statusBar.hide();
            return; // No open text editor
        }

        let document = editor.document;
        let selection = editor.selection;
        let text = selection.isEmpty ? document.getText() : document.getText(selection);

        // Handle special tokens before tokenizing
        const { text: processedText, specialTokenCount } = handleSpecialTokens(text, currentModel);

        let tokenCount;
        if (currentProvider === 'anthropic') {
            tokenCount = countTokens(processedText) + specialTokenCount;
        } else if (encoder) {
            tokenCount = encoder.encode(processedText).length + specialTokenCount;
        } else {
            tokenCount = specialTokenCount;
        }

        statusBar.text = `Tokens: ${tokenCount} (${currentModel})`;
        statusBar.show();
    };

    vscode.window.onDidChangeTextEditorSelection(updateTokenCount, null, context.subscriptions);
    vscode.window.onDidChangeActiveTextEditor(updateTokenCount, null, context.subscriptions);
    vscode.workspace.onDidChangeTextDocument(updateTokenCount, null, context.subscriptions);

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('gptTokenCounterLive.defaultModel')) {
            let newDefault = config.get('defaultModel');
            if (newDefault && newDefault !== `${currentProvider}: ${currentModel}`) {
                const [newProvider, newModel] = newDefault.split(': ');
                currentProvider = newProvider;
                currentModel = newModel;
                if (currentProvider === 'openai') {
                    try {
                        initializeEncoder(currentModel);
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to load encoder for model ${currentModel}: ${error.message}`);
                        return;
                    }
                }
                updateTokenCount();
            }
        }
    });

    let disposable = vscode.commands.registerCommand('gpt-token-counter-live.changeModel', async function () {
        let flatModelList = Object.entries(modelProviders).reduce((acc, [provider, models]) => acc.concat(models.map(model => `${provider}: ${model}`)), []);
        let selection = await vscode.window.showQuickPick(flatModelList, {
            placeHolder: 'Select a Model',
        });

        if (selection) {
            const [provider, model] = selection.split(': ');
            currentProvider = provider;
            currentModel = model;

            if (currentProvider === 'openai') {
                try {
                    initializeEncoder(currentModel);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to load encoder for model ${currentModel}: ${error.message}`);
                    return;
                }
            }

            updateTokenCount();
        }
    });

    context.subscriptions.push(disposable);

    // Initial update
    initializeEncoder(currentModel);
    updateTokenCount();
}

function deactivate() {
    if (encoder) {
        encoder.free();
    }
}

module.exports = {
    activate,
    deactivate
}
