package demo;

import org.springframework.context.annotation.AdviceMode;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

@Configuration @EnableAsync(mode = AdviceMode.ASPECTJ) public class AjConfig {}
