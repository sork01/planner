<?php

date_default_timezone_set('Europe/Berlin');

define('DATA_DIR', __DIR__ . '/data/');

if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}