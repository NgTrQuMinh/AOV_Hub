<!DOCTYPE html>
<html lang="vi">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title><?= $title ?? 'AOV HUB' ?></title>

    <link rel="stylesheet" href="<?= BASE_ASSETS ?>css/common.css">
    <?php if (isset($css)): ?>
        <link rel="stylesheet" href="<?= BASE_ASSETS ?>css/<?= $css ?>.css">
    <?php endif; ?>
</head>

<body>

    <?php require_once PATH_VIEW . 'layouts/header.php'; ?>

    <main class="container">
        <?php
        if (isset($view)) {
            require_once PATH_VIEW . $view . '.php';
        }
        ?>
    </main>

    <?php require_once PATH_VIEW . 'layouts/footer.php'; ?>

    <script src="<?= BASE_ASSETS ?>js/storage.js"></script>
    <script src="<?= BASE_ASSETS ?>js/favorite.js"></script>
    <script src="<?= BASE_ASSETS ?>js/main.js"></script>
    <?php if (isset($js)): ?>
        <script src="<?= BASE_ASSETS ?>js/<?= $js ?>.js"></script>
    <?php endif; ?>
</body>

</html>
